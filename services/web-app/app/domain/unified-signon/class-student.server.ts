import { randomBytes } from 'node:crypto';
import { identifierKind } from './contracts';
import type { Prisma } from '@app/prisma';
import { z } from 'zod';
import { getPasswordHash, verifyUserPassword } from '~/utils/auth.server';
import {
  PasswordAndConfirmPasswordSchema,
  PasswordSchema,
} from '~/utils/schemas/user';
import { validateUsername } from '~/utils/username';
import {
  consumeLoginAttemptRateLimits,
  refundLoginAttemptRateLimits,
} from '~/utils/rate-limit.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { classStudentLoginRateLimitTarget } from '~/utils/login-rate-limit-target';
import { assertFreeClassSeatAvailableInTx } from '~/domain/free-tier/class-seat-cap.server';
import { assertFreeTierSpendAllowed } from '~/domain/free-tier/usage-budget.server';
import { classSummary, selectedClass } from './classes.server';
import { FlowError, stateFor, type Flow } from './flow.server';
import { finishAuthentication } from './authentication.server';
import {
  rememberClassConfirmation,
  classConfirmationState,
} from './class-confirmation.server';
import {
  StudentNameSchema,
  studentHandleBase,
  handleCandidate,
  HANDLE_ATTEMPTS,
} from './student-handle';

const key = (value: string) => value.normalize('NFKC').toLowerCase();
async function context(tx: Prisma.TransactionClient, flow: Flow) {
  const klass = await selectedClass(tx, flow);
  if (!klass)
    throw new FlowError('Class not found. Enter your class code again.');
  // Share the same lock as seat-cap registration and class maintenance. Reads
  // after the lock revalidate code/archive changes made while we waited.
  await tx.$queryRaw`SELECT "id" FROM "Class" WHERE "id" = ${klass.id} FOR UPDATE`;
  const current = await selectedClass(tx, flow);
  if (!current)
    throw new FlowError('Class not found. Enter your class code again.');
  return current;
}
export async function chooseStudent(
  tx: Prisma.TransactionClient,
  flow: Flow,
  choice: string
) {
  if (
    (!['class-found', 'class-handle', 'class-signin'].includes(
      flow.data.state.screen
    ) &&
      !flow.data.studentEmailSignup) ||
    !['new', 'returning'].includes(choice)
  )
    throw new FlowError();
  const klass = await context(tx, flow);
  if (choice === 'new') {
    const seat = await assertFreeClassSeatAvailableInTx(tx, {
      classId: klass.id,
      organizationId: klass.school.organizationId,
    });
    if (!seat.ok) throw new FlowError(seat.error);
  }
  // Retain only display context before discarding the entered email.
  flow.data.studentEmailOrigin ??=
    identifierKind(flow.data.identifier ?? '') === 'email' &&
    flow.data.proof !== 'google' &&
    !flow.data.pendingGoogle &&
    !flow.data.studentGoogle;
  if (flow.data.studentEmailSignup) {
    flow.data.proof = undefined;
    flow.data.pendingGoogle = undefined;
    flow.data.studentGoogle = undefined;
  }
  flow.data.studentEmailSignup = undefined;
  flow.data.studentChoice = choice as 'new' | 'returning';
  flow.data.identifier = undefined;
  flow.data.userId = undefined;
  flow.data.invitationId = undefined;
  flow.data.otp = undefined;
  return stateFor(flow, {
    screen: choice === 'new' ? 'class-handle' : 'class-signin',
    classInfo: classSummary(klass),
  });
}
async function findHandle(
  tx: Prisma.TransactionClient,
  classId: string,
  raw: string
) {
  const handleKey = key(raw.trim().replace(/^@/, ''));
  if (!handleKey || handleKey.length > 90) return null;
  const aliases = await tx.classStudentHandle.findMany({
    where: { classId, handleKey },
    select: { userId: true },
  });
  const legacy = await tx.user.findMany({
    where: {
      username: { equals: handleKey, mode: 'insensitive' },
      memberships: {
        some: { role: 'STUDENT', classesAsStudent: { some: { id: classId } } },
      },
    },
    select: { id: true },
    take: 2,
  });
  const ids = new Set([
    ...aliases.map((a) => a.userId),
    ...legacy.map((u) => u.id),
  ]);
  // Legacy duplicates or an alias overlapping another account fail closed.
  return ids.size === 1 ? [...ids][0] : null;
}
async function available(
  tx: Prisma.TransactionClient,
  classId: string,
  handle: string
) {
  const handleKey = key(handle);
  const alias = await tx.classStudentHandle.findUnique({
    where: { classId_handleKey: { classId, handleKey } },
  });
  const legacy = await tx.user.findFirst({
    where: {
      username: { equals: handleKey, mode: 'insensitive' },
      memberships: { some: { classesAsStudent: { some: { id: classId } } } },
    },
    select: { id: true },
  });
  return !alias && !legacy;
}
export async function registerStudent(
  tx: Prisma.TransactionClient,
  flow: Flow,
  values: Record<string, string>
) {
  if (
    flow.data.studentChoice !== 'new' ||
    flow.data.state.screen !== 'class-handle'
  )
    throw new FlowError();
  const parsed = z
    .object({ firstName: StudentNameSchema, lastName: StudentNameSchema })
    .and(PasswordAndConfirmPasswordSchema)
    .safeParse(values);
  if (!parsed.success)
    throw new FlowError(
      'Check your details.',
      400,
      undefined,
      Object.fromEntries(
        parsed.error.issues.map((i) => [String(i.path[0]), i.message])
      )
    );
  const klass = await context(tx, flow);
  const seat = await assertFreeClassSeatAvailableInTx(tx, {
    classId: klass.id,
    organizationId: klass.school.organizationId,
  });
  if (!seat.ok) throw new FlowError(seat.error);
  if (klass.school.organization.plan === 'FREE_CLASSROOM')
    await assertFreeTierSpendAllowed(tx);
  const base = studentHandleBase(parsed.data.firstName, parsed.data.lastName);
  let handle: string | undefined;
  for (let attempt = 0; attempt < HANDLE_ATTEMPTS; attempt++) {
    const candidate = handleCandidate(base, attempt);
    if (await available(tx, klass.id, candidate)) {
      handle = candidate;
      break;
    }
  }
  if (!handle)
    throw new FlowError(
      'We could not create a handle. Ask your teacher for help.'
    );
  // Dual-write a globally unique legacy username so rollback and teacher reset
  // remain supported. A different class can use the same visible alias.
  let username: string | undefined;
  const legacyBase = validateUsername(base.toLowerCase()).ok
    ? base.toLowerCase()
    : 'studentuser';
  for (let attempt = 0; attempt < HANDLE_ATTEMPTS; attempt++) {
    const candidate =
      attempt === 0
        ? legacyBase
        : `${legacyBase.slice(0, 17)}_${randomBytes(6).toString('hex')}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate}))`;
    const occupiedAlias = await tx.classStudentHandle.findUnique({
      where: {
        classId_handleKey: { classId: klass.id, handleKey: key(candidate) },
      },
    });
    if (
      !occupiedAlias &&
      !(await tx.user.findUnique({
        where: { username: candidate },
        select: { id: true },
      }))
    ) {
      username = candidate;
      break;
    }
  }
  if (!username)
    throw new FlowError(
      'We could not create a handle. Ask your teacher for help.'
    );
  const user = await tx.user.create({
    data: {
      name: `${parsed.data.firstName} ${parsed.data.lastName}`,
      username,
      password: {
        create: { hash: await getPasswordHash(parsed.data.password) },
      },
      memberships: {
        create: {
          role: 'STUDENT',
          organizationId: klass.school.organizationId,
          classesAsStudent: { connect: { id: klass.id } },
        },
      },
      classStudentHandles: {
        create: { classId: klass.id, handle, handleKey: key(handle) },
      },
    },
    include: { memberships: true },
  });
  // Google proves only the provider subject here. Its email never enters a
  // student account, challenge, invitation or login identifier.
  if (flow.data.studentGoogle)
    await tx.signonIdentity.create({
      data: {
        provider: 'google',
        subject: flow.data.studentGoogle.subject,
        userId: user.id,
      },
    });
  flow.data.studentGoogle = undefined;
  flow.data.pendingGoogle = undefined;
  flow.data.identifier = '@' + handle;
  flow.data.userId = user.id;
  flow.data.proof = 'password';
  rememberClassConfirmation(flow, klass, user.memberships[0].id, false, handle);
  // The generated handle must be shown before navigating away. Session is
  // issued only by the explicit continuation through finishAuthentication.
  flow.data.studentChoice = undefined;
  return classConfirmationState(tx, flow);
}
export async function studentPassword(
  tx: Prisma.TransactionClient,
  flow: Flow,
  request: Request,
  values: Record<string, string>
) {
  if (
    flow.data.studentChoice !== 'returning' ||
    flow.data.state.screen !== 'class-signin'
  )
    throw new FlowError();
  const klass = await context(tx, flow);
  const cfg = RATE_LIMITS.unauth.login;
  const decision = await consumeLoginAttemptRateLimits({
    request,
    route: '/auth/login',
    targetKey: classStudentLoginRateLimitTarget(
      klass.id,
      values.username || ''
    ),
    perIpPerMinute: cfg.perIpPerMinute,
    perIpPerHour: cfg.perIpPerHour,
    perTargetPerHour: cfg.perEmailPerHour,
    perIpHandlePer15Minutes: cfg.perIpHandlePer15Minutes,
    perIpSprayPerHour: cfg.perIpFailedSprayPerHour,
  });
  if (!decision.allowed)
    throw new FlowError(
      'Too many login attempts. Please wait and try again.',
      429,
      decision.retryAfterSeconds
    );
  const userId = await findHandle(tx, klass.id, values.username || '');
  if (userId)
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user =
    userId && PasswordSchema.safeParse(values.password).success
      ? await verifyUserPassword({ id: userId }, values.password)
      : null;
  const membership =
    user &&
    (await tx.orgMembership.findFirst({
      where: {
        userId: user.id,
        organizationId: klass.school.organizationId,
        role: 'STUDENT',
        isActive: true,
        classesAsStudent: { some: { id: klass.id } },
      },
      select: { id: true },
    }));
  if (!user || !membership)
    throw new FlowError("That handle and password don't match.");
  await refundLoginAttemptRateLimits(decision.charged);
  flow.data.identifier = '@' + (values.username || '').replace(/^@/, '');
  flow.data.userId = user.id;
  flow.data.proof = 'password';
  flow.data.pendingGoogle = undefined;
  flow.data.studentGoogle = undefined;
  // Already enrolled; never enroll a different account on a returning path.
  rememberClassConfirmation(flow, klass, membership.id, true);
  return finishAuthentication(tx, flow, request, user.id, true, membership.id);
}
