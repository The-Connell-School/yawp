import {
  chooseStudent,
  registerStudent,
  studentPassword,
} from './class-student.server';
import { randomInt, timingSafeEqual } from 'node:crypto';
import type { Prisma } from '@app/prisma';
import { z } from 'zod';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { prisma } from '~/utils/db.server';
import { getUserId, getPasswordHash } from '~/utils/auth.server';
import {
  NameSchema,
  PasswordAndConfirmPasswordSchema,
} from '~/utils/schemas/user';
import {
  enforceUnauthByIpAndTarget,
  enforceUnauthByIpOnly,
} from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { assertFreeClassSeatAvailableInTx } from '~/domain/free-tier/class-seat-cap.server';
import {
  getUaPartnerContext,
  isUaPartnerHost,
  isValidUaPartnerCode,
  requireUaOrganizationId,
  commitUaPartnerContext,
} from '~/utils/ua-partner.server';
import { requireFreeTierEnabled } from '~/utils/free-tier/free-tier-feature-gate.server';
import {
  sendReleaseEmailsForApplicationIds,
  resendFreeTierAdminApprovalReminder,
} from '~/domain/free-tier/approval-flow.server';
import { normalizeIdentifier, codeDigest } from './policy.server';
import {
  assertCurrentIdentity,
  createFlow,
  flowCookie,
  FlowError,
  opaque,
  saveNewFlow,
  stateFor,
  withFlow,
  type Flow,
} from './flow.server';
import { chooseClass, resolveClasses, selectedClass } from './classes.server';
import { deliverCode } from './mail.server';
import { assertResendMailAvailable } from './resend-mail.server';
import { finishAuthentication } from './authentication.server';
import { readInvitation, prepareInvitation } from './invitations.server';
import { beginGoogle, googleAvailable } from './google.server';

export async function limit(
  request: Request,
  target: string,
  kind: 'signup' | 'verify' | 'forgotPassword' = 'signup'
) {
  const cfg = RATE_LIMITS.unauth[kind];
  const decision = await enforceUnauthByIpAndTarget({
    request,
    route: `/auth/unified/${kind}`,
    targetKey: target,
    perIpPerMinute: cfg.perIpPerMinute,
    perIpPerHour: cfg.perIpPerHour,
    perTargetPerHour: cfg.perEmailPerHour,
  });
  if (!decision.allowed)
    throw new FlowError(
      `Too many attempts. Try again in ${Math.ceil(decision.retryAfterSeconds / 60)} minutes.`,
      429,
      decision.retryAfterSeconds
    );
}
export async function resolveIdentifier(
  tx: Prisma.TransactionClient,
  flow: Flow,
  raw: string
) {
  const parsed = normalizeIdentifier(raw);
  if (flow.data.studentEmailSignup && (!parsed || parsed.kind !== 'email'))
    throw new FlowError('Enter your school email.', 400, undefined, {
      identifier: 'That email looks incomplete. Check it and try again.',
    });
  if (!parsed) throw new FlowError('Enter your email or class code.');
  flow.data.studentEmailOrigin = undefined;
  if (parsed.kind !== 'email') {
    flow.data.identifier = undefined;
    flow.data.userId = undefined;
    flow.data.proof = undefined;
    flow.data.purpose = undefined;
    flow.data.otp = undefined;
    flow.data.invitationId = undefined;
    flow.data.studentChoice = undefined;
    flow.data.studentEmailSignup = undefined;
    flow.data.classId = undefined;
    flow.data.classCode = undefined;
    try {
      return await resolveClasses(tx, flow, parsed.value);
    } catch (error) {
      if (error instanceof FlowError && error.fieldErrors?.classCode)
        throw new FlowError(
          error.message,
          error.status,
          error.retryAfterSeconds,
          { identifier: error.fieldErrors.classCode }
        );
      throw error;
    }
  }
  const user = await tx.user.findFirst({
    where: { email: { equals: parsed.value, mode: 'insensitive' } },
    select: { id: true, password: { select: { userId: true } } },
  });
  flow.data.pendingGoogle = undefined;
  flow.data.studentGoogle = undefined;
  flow.data.identifier = parsed.value;
  flow.data.userId = user?.id;
  flow.data.proof = undefined;
  flow.data.otp = undefined;
  flow.data.purpose = undefined;
  const invitation = await tx.invitation.findFirst({
    where: {
      target: { equals: parsed.value, mode: 'insensitive' },
      type: { in: ['onboard-student', 'onboard-teacher', 'onboard-owner'] },
      ...(user
        ? { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
        : {}),
    },
    select: { id: true },
  });
  flow.data.invitationId = invitation?.id;
  if (flow.data.studentEmailSignup) {
    const klass = await selectedClass(tx, flow);
    if (!klass || klass.school.organization.plan === 'FREE_CLASSROOM')
      throw new FlowError('Class not found. Enter your class code again.');
    if (user)
      return stateFor(flow, {
        screen: 'class-email',
        variant: 'existing',
        identifier: parsed.value,
        notice:
          'You already have an account with this email. Sign in to join this class.',
      });
  }
  if (user)
    return stateFor(flow, {
      screen: user.password ? 'password' : 'activation',
      identifier: parsed.value,
    });
  if (flow.data.classId || invitation)
    return stateFor(flow, {
      screen: 'activation',
      identifier: parsed.value,
      classInfo: flow.data.state.classInfo,
    });
  if (flow.data.partnerEntry)
    return stateFor(flow, {
      screen: flow.data.partner ? 'activation' : 'partner-code',
      identifier: parsed.value,
    });
  return stateFor(flow, { screen: 'account-type', identifier: parsed.value });
}
function otpContext(flow: Flow, generation: string) {
  return {
    flow: flow.id,
    identity: flow.data.identifier!,
    purpose: flow.data.purpose!,
    classId: flow.data.classId || '',
    invitation: flow.data.invitationId || '',
    partner: flow.data.partner ? 'ua' : '',
    generation,
  };
}
async function issueCode(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request,
  purpose?: string,
  resend = false
) {
  const parsed = normalizeIdentifier(flow.data.identifier || '');
  if (parsed?.kind !== 'email')
    throw new FlowError('Ask your teacher to reset it.');
  await assertCurrentIdentity(tx, flow);
  const now = Date.now();
  if (flow.data.otp && now - flow.data.otp.sent < 60000)
    throw new FlowError(
      'Too many attempts. Try again in 1 minute.',
      429,
      Math.ceil((flow.data.otp.sent + 60000 - now) / 1000)
    );
  await limit(request, parsed.value, 'forgotPassword');
  if (!resend) {
    flow.data.purpose =
      purpose === 'reset-password'
        ? 'reset'
        : purpose === 'trial'
          ? 'trial'
          : flow.data.userId
            ? 'signin'
            : 'signup';
    // Invitations are chosen server-side only and revalidated on use.
    const invitation = await tx.invitation.findFirst({
      where: {
        target: { equals: parsed.value, mode: 'insensitive' },
        type: { in: ['onboard-teacher', 'onboard-owner', 'onboard-student'] },
        ...(flow.data.userId
          ? { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    flow.data.invitationId = invitation?.id;
  }
  if (!flow.data.purpose) throw new FlowError();
  const generation = opaque();
  const code = randomInt(0, 1000000).toString().padStart(6, '0');
  flow.data.otp = {
    generation,
    hash: codeDigest(otpContext(flow, generation), code),
    expires: now + 600000,
    attempts: 0,
    sent: now,
  };
  flow.data.proof = undefined;
  // Reset has the same response for existing/missing identities. Missing users
  // get no deliverable challenge; a guessed code cannot create an account.
  if (flow.data.purpose !== 'reset' || flow.data.userId)
    await deliverCode(parsed.value, code);
  return stateFor(flow, {
    screen: 'email-code',
    identifier: parsed.value,
    variant: flow.data.purpose === 'reset' ? 'reset' : undefined,
    notice: resend ? 'New code sent. Check spam too.' : undefined,
    classInfo: flow.data.state.classInfo,
  });
}
async function trialStatus(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request
) {
  await requireFreeTierEnabled();
  if (!flow.data.proof) throw new FlowError('Verify your email first.', 401);
  const application = await tx.freeTierApplication.findFirst({
    where: { email: { equals: flow.data.identifier, mode: 'insensitive' } },
    include: { adminApprovals: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });
  const variants: Record<string, string> = {
    LEAD: 'lead',
    INVITED: 'invited',
    SENT: 'sent',
    MANUAL_REVIEW: 'review',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
  };
  if (application?.userId && flow.data.userId === application.userId)
    return finishAuthentication(tx, flow, request, application.userId);
  return stateFor(flow, {
    screen: 'trial-status',
    identifier: flow.data.identifier,
    variant: variants[application?.status || 'LEAD'] || 'lead',
    adminName: application?.adminApprovals[0]?.adminName,
    sentDate: application?.adminApprovals[0]?.createdAt.toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric', timeZone: 'UTC' }
    ),
  });
}
async function verifyCode(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request,
  raw: string
) {
  await limit(request, flow.data.identifier || flow.id, 'verify');
  await assertCurrentIdentity(tx, flow);
  const otp = flow.data.otp;
  if (!otp || otp.attempts >= 5 || otp.expires <= Date.now())
    return Response.json(
      stateFor(flow, {
        screen: 'email-code',
        identifier: flow.data.identifier,
        variant: 'expired',
        fieldErrors: {
          code: 'That code has expired. Send yourself a new one.',
        },
      }),
      { status: 400 }
    );
  otp.attempts++;
  const actual = codeDigest(otpContext(flow, otp.generation), raw);
  if (
    !/^\d{6}$/.test(raw) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(otp.hash))
  )
    return Response.json(
      {
        error: '',
        fieldErrors: {
          code: "That code isn't right. Use the one from our most recent email.",
        },
      },
      { status: 400 }
    );
  // The flow row lock makes consumption and proof persistence atomic.
  flow.data.otp = undefined;
  if (flow.data.purpose === 'reset' && !flow.data.userId)
    return Response.json(
      {
        error: '',
        fieldErrors: {
          code: "That code isn't right. Use the one from our most recent email.",
        },
      },
      { status: 400 }
    );
  flow.data.proof = 'email';
  if (flow.data.purpose === 'trial') return trialStatus(tx, flow, request);
  if (flow.data.purpose === 'reset')
    return stateFor(flow, {
      screen: 'name-password',
      identifier: flow.data.identifier,
      variant: 'reset',
    });
  if (flow.data.userId) {
    const user = await tx.user.findUniqueOrThrow({
      where: { id: flow.data.userId },
      select: { password: { select: { userId: true } } },
    });
    if (user.password) {
      return finishAuthentication(tx, flow, request, flow.data.userId);
    }
  }
  try {
    const invitationState = await prepareInvitation(tx, flow, request);
    if (invitationState)
      return invitationState instanceof Response
        ? invitationState
        : stateFor(flow, invitationState);
  } catch (error) {
    if (
      error instanceof FlowError &&
      error.message === 'Your invitation expired.'
    )
      return stateFor(flow, {
        screen: 'activation',
        identifier: flow.data.identifier,
        variant: 'expired',
      });
    if (error instanceof FlowError)
      return Response.json(
        {
          error: 'Something went wrong with this sign-up. Please start again.',
        },
        { status: 400 }
      );
    throw error;
  }
  return stateFor(flow, {
    screen: 'name-password',
    identifier: flow.data.identifier,
    classInfo: flow.data.state.classInfo,
  });
}
async function createAccount(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request,
  values: Record<string, string>
) {
  if (
    !flow.data.proof ||
    !flow.data.identifier ||
    flow.data.identifier.startsWith('@')
  )
    throw new FlowError('Verify your email first.');
  await assertCurrentIdentity(tx, flow);
  await limit(request, flow.data.identifier);
  const google = flow.data.proof === 'google';
  const reset = flow.data.purpose === 'reset';
  const schema = (reset ? z.object({}) : z.object({ name: NameSchema })).and(
    google ? z.object({}) : PasswordAndConfirmPasswordSchema
  );
  const parsed = schema.safeParse(values);
  if (!parsed.success)
    return Response.json(
      {
        error: 'Check your details.',
        fieldErrors: Object.fromEntries(
          parsed.error.issues.map((i) => [String(i.path[0]), i.message])
        ),
      },
      { status: 400 }
    );
  const hash = google ? undefined : await getPasswordHash(values.password);
  let user = await tx.user.findFirst({
    where: { email: { equals: flow.data.identifier, mode: 'insensitive' } },
    include: { password: true },
  });
  if (reset || (user && !user.password)) {
    if (!user || user.id !== flow.data.userId || !hash)
      throw new FlowError('Please sign in again.');
    await tx.password.upsert({
      where: { userId: user.id },
      create: { userId: user.id, hash },
      update: { hash },
    });
    await tx.user.update({
      where: { id: user.id },
      data: {
        emailVerifiedAt: new Date(),
        mustChangePassword: false,
        ...(!reset ? { name: values.name } : {}),
      },
    });
    if (reset) await tx.session.deleteMany({ where: { userId: user.id } });
    return finishAuthentication(tx, flow, request, user.id);
  }
  if (user)
    throw new FlowError('You already have an account. Sign in instead.');
  const invitation = await readInvitation(tx, flow);
  const klass =
    invitation?.role === 'TEACHER' ? null : await selectedClass(tx, flow);
  const organizationId =
    invitation?.organizationId ||
    (flow.data.partner
      ? requireUaOrganizationId()
      : klass?.school.organizationId);
  const role = invitation?.role || 'STUDENT';
  const owner = invitation?.owner || false;
  const schoolId =
    invitation && 'schoolId' in invitation ? invitation.schoolId : undefined;
  if (!organizationId || (!klass && role === 'STUDENT' && !flow.data.partner))
    throw new FlowError('Enter your class code to continue.');
  if (klass?.school.organization.plan === 'FREE_CLASSROOM')
    throw new FlowError('Use a handle to join this class.');
  if (klass) {
    const seat = await assertFreeClassSeatAvailableInTx(tx, {
      classId: klass.id,
      organizationId,
    });
    if (!seat.ok) throw new FlowError(seat.error);
  }
  if (invitation) {
    await tx.invitation.delete({ where: { id: invitation.invite.id } });
    flow.data.invitationId = undefined;
  }
  user = await tx.user.create({
    data: {
      email: flow.data.identifier,
      name: values.name,
      emailVerifiedAt: new Date(),
      ...(hash ? { password: { create: { hash } } } : {}),
      memberships: {
        create: {
          organizationId,
          role,
          isOrgOwner: owner,
          ...(klass ? { classesAsStudent: { connect: { id: klass.id } } } : {}),
          ...(schoolId ? { schools: { connect: { id: schoolId } } } : {}),
        },
      },
    },
    include: { password: true },
  });
  if (google && flow.data.pendingGoogle) {
    await tx.signonIdentity.create({
      data: {
        provider: 'google',
        subject: flow.data.pendingGoogle.subject,
        userId: user.id,
      },
    });
    flow.data.pendingGoogle = undefined;
  }
  // Already connected by the authoritative signup operation in this transaction.
  flow.data.classId = undefined;
  flow.data.classCode = undefined;
  if (flow.data.partner) flow.data.destination = '/billing/ua';
  return finishAuthentication(tx, flow, request, user.id);
}
async function operate(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request,
  operation: string,
  values: Record<string, string>,
  authenticatedUserId: string | null
) {
  if (operation === 'student-email') {
    if (
      (flow.data.state.screen !== 'class-handle' &&
        !flow.data.studentEmailSignup) ||
      flow.data.studentChoice !== 'new'
    )
      throw new FlowError();
    const klass = await selectedClass(tx, flow);
    if (!klass || klass.school.organization.plan === 'FREE_CLASSROOM')
      throw new FlowError();
    flow.data.studentEmailSignup = true;
    flow.data.identifier = undefined;
    flow.data.userId = undefined;
    flow.data.proof = undefined;
    flow.data.invitationId = undefined;
    flow.data.otp = undefined;
    flow.data.pendingGoogle = undefined;
    flow.data.studentGoogle = undefined;
    return stateFor(flow, { screen: 'class-email' });
  }
  if (operation === 'class-email-signin') {
    if (!flow.data.studentEmailSignup || flow.data.studentChoice !== 'new')
      throw new FlowError();
    // Back can restore an earlier client screen after a different address was
    // resolved. Re-resolve the displayed email before ordinary authentication;
    // a posted user ID, proof or destination never selects the account.
    const resolved = await resolveIdentifier(
      tx,
      flow,
      values.identifier || flow.data.identifier || ''
    );
    if (!flow.data.userId) return resolved;
    await assertCurrentIdentity(tx, flow);
    const password = await tx.password.findUnique({
      where: { userId: flow.data.userId },
      select: { userId: true },
    });
    return stateFor(flow, {
      screen: password ? 'password' : 'activation',
      identifier: flow.data.identifier,
    });
  }
  if (operation === 'student-choice')
    return chooseStudent(tx, flow, values.choice);
  if (operation === 'register-student') {
    await limit(request, flow.id);
    return registerStudent(tx, flow, values);
  }
  if (operation === 'student-password')
    return studentPassword(tx, flow, request, values);
  if (operation === 'complete-student') {
    if (
      flow.data.state.screen !== 'joined' ||
      !flow.data.userId ||
      flow.data.proof !== 'password'
    )
      throw new FlowError();
    return finishAuthentication(tx, flow, request, flow.data.userId);
  }
  if (operation === 'resolve')
    return resolveIdentifier(tx, flow, values.identifier || '');
  if (operation === 'resolve-class') {
    if (flow.data.purpose === 'reset')
      throw new FlowError('Finish resetting your password first.');
    if (flow.data.state.screen === 'ambiguity') {
      flow.data.identifier = undefined;
      flow.data.userId = undefined;
    }
    if (flow.data.proof === 'email') flow.data.proof = undefined;
    flow.data.classId = undefined;
    flow.data.classCandidates = undefined;
    flow.data.studentChoice = undefined;
    flow.data.studentEmailSignup = undefined;
    const result = await resolveClasses(tx, flow, values.classCode || '');
    flow.data.otp = undefined; // A new class context requires a new challenge.
    if (
      authenticatedUserId &&
      authenticatedUserId === flow.data.userId &&
      flow.data.classId &&
      result.state.variant !== 'full' &&
      result.state.variant !== 'multiple'
    )
      return finishAuthentication(
        tx,
        flow,
        request,
        authenticatedUserId,
        false
      );
    return result;
  }
  if (operation === 'choose-class') {
    if (
      !flow.data.invitationId &&
      flow.data.classId !== values.classId &&
      flow.data.proof === 'email'
    )
      flow.data.proof = undefined;
    flow.data.otp = undefined;
    const result = await chooseClass(tx, flow, values.classId || '');
    if (
      authenticatedUserId &&
      authenticatedUserId === flow.data.userId &&
      result.state.variant !== 'full'
    )
      return finishAuthentication(
        tx,
        flow,
        request,
        authenticatedUserId,
        false
      );
    return result;
  }
  if (operation === 'send-code')
    return issueCode(tx, flow, request, values.purpose);
  if (operation === 'resend-code')
    return issueCode(tx, flow, request, undefined, true);
  if (operation === 'verify-code')
    return verifyCode(tx, flow, request, values.code || '');
  if (operation === 'create-account')
    return createAccount(tx, flow, request, values);
  if (operation === 'google') return beginGoogle(flow, request);
  if (operation === 'partner-code') {
    if (
      !isUaPartnerHost(request) ||
      !isValidUaPartnerCode(values.organizationCode)
    )
      throw new FlowError(
        "We couldn't find that organization code. Check it with your program coordinator.",
        400,
        undefined,
        {
          organizationCode:
            "We couldn't find that organization code. Check it with your program coordinator.",
        }
      );
    requireUaOrganizationId();
    flow.data.partner = true;
    return Response.json(
      stateFor(flow, {
        screen: flow.data.proof ? 'name-password' : 'activation',
        identifier: flow.data.identifier,
        variant: flow.data.proof === 'google' ? 'google' : undefined,
      }),
      { headers: { 'set-cookie': await commitUaPartnerContext() } }
    );
  }
  if (operation === 'join-handle') {
    throw new FlowError('Choose New or Returning to continue.');
  }
  if (operation === 'select-membership') {
    if (!authenticatedUserId) throw new FlowError('Sign in to continue.', 401);
    if (!values.membershipId)
      throw new FlowError('Choose an active membership.', 400);
    if (authenticatedUserId !== flow.data.userId)
      throw new FlowError('Sign in to continue.', 403);
    return finishAuthentication(
      tx,
      flow,
      request,
      authenticatedUserId,
      false,
      values.membershipId
    );
  }
  if (operation === 'link-google' || operation === 'skip-google') {
    if (
      !authenticatedUserId ||
      authenticatedUserId !== flow.data.userId ||
      !flow.data.pendingGoogle
    )
      throw new FlowError('Sign in to link this account.', 401);
    if (operation === 'link-google') {
      await assertCurrentIdentity(tx, flow);
      if (!googleAvailable())
        throw new FlowError('Google sign-in is unavailable.', 503);
      const existing = await tx.signonIdentity.findFirst({
        where: {
          provider: 'google',
          OR: [
            { subject: flow.data.pendingGoogle.subject },
            { userId: authenticatedUserId },
          ],
        },
      });
      if (
        existing &&
        (existing.subject !== flow.data.pendingGoogle.subject ||
          existing.userId !== authenticatedUserId)
      )
        throw new FlowError('This Google identity is already linked.', 403);
      if (!existing)
        await tx.signonIdentity.create({
          data: {
            provider: 'google',
            subject: flow.data.pendingGoogle.subject,
            userId: authenticatedUserId,
          },
        });
    }
    flow.data.pendingGoogle = undefined;
    return finishAuthentication(tx, flow, request, authenticatedUserId, false);
  }
  if (operation === 'trial-status') {
    if (!flow.data.proof) return issueCode(tx, flow, request, 'trial');
    return trialStatus(tx, flow, request);
  }
  if (operation === 'resend-invite' || operation === 'resend-approval') {
    await requireFreeTierEnabled();
    assertResendMailAvailable();
    if (!flow.data.proof) throw new FlowError('Verify your email first.', 401);
    await limit(request, flow.data.identifier || flow.id, 'forgotPassword');
    const application = await tx.freeTierApplication.findFirst({
      where: { email: { equals: flow.data.identifier, mode: 'insensitive' } },
    });
    if (
      application &&
      operation === 'resend-invite' &&
      application.status === 'INVITED'
    )
      await sendReleaseEmailsForApplicationIds([application.id]);
    if (
      application &&
      operation === 'resend-approval' &&
      authenticatedUserId &&
      authenticatedUserId === application.userId
    )
      await resendFreeTierAdminApprovalReminder({
        applicationId: application.id,
        request,
      });
    return {
      state: {
        ...flow.data.state,
        notice: 'If available, an email is on its way.',
      },
    };
  }
  throw new FlowError('This sign-in option is unavailable.', 400);
}
export async function unifiedAction(
  request: Request,
  values: Record<string, string>
) {
  const operation = values.intent;
  const decision = await enforceUnauthByIpOnly({
    request,
    route: '/auth/unified/lookup',
    ...RATE_LIMITS.unauth.joinLookup,
  });
  if (!decision.allowed)
    throw new FlowError(
      `Too many attempts. Try again in ${Math.ceil(decision.retryAfterSeconds / 60)} minutes.`,
      429,
      decision.retryAfterSeconds
    );
  const authenticatedUserId = await getUserId(request);
  if (!values.flowToken && ['resolve', 'google'].includes(operation)) {
    const flow = await createFlow(
      request,
      safeRedirect(values.redirectTo, '/app')
    );
    flow.data.partnerEntry = isUaPartnerHost(request);
    flow.data.partner = Boolean(
      isUaPartnerHost(request) && (await getUaPartnerContext(request))
    );
    const result = await prisma.$transaction(
      (tx) =>
        operate(tx, flow, request, operation, values, authenticatedUserId),
      { timeout: 20000 }
    );
    await saveNewFlow(flow);
    const response =
      result instanceof Response ? result : Response.json(result);
    response.headers.append(
      'set-cookie',
      await flowCookie.serialize({ browser: flow.browser, token: flow.token })
    );
    return response;
  }
  return withFlow(request, values.flowToken, async (flow, tx) => {
    const result = await operate(
      tx,
      flow,
      request,
      operation,
      values,
      authenticatedUserId
    );
    return result instanceof Response ? result : Response.json(result);
  });
}
