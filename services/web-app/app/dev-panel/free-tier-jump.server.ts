import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { LOCAL_DEV_PASSWORD } from '../../../../packages/prisma/scripts/local-dev/dev-personas';
import { emailDomain } from '~/domain/free-tier/admin-email-rules.server';
import { submitAdminDetails } from '~/domain/free-tier/approval-flow.server';
import { ensureLockedPreviewClassroomForUser } from '~/domain/free-tier/locked-preview.server';
import { provisionFreeClassroom } from '~/domain/free-tier/provision-free-classroom.server';
import { saveClassPreparation } from '~/domain/free-tier/class-preparation.server';
import {
  FREE_TIER_LINK_TTL_MS,
  mintSignedLink,
} from '~/domain/free-tier/signed-link.server';
import { freeTierPublicAppOrigin } from '~/domain/free-tier/free-tier-public-url.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { prisma } from '~/utils/db.server';
import { combineHeaders } from '~/utils/misc';
import { lessonPlanMonthWindow } from '~/utils/lesson-planner/month-window';
import { findFreeTierState } from './free-tier-states.catalog';
import { createDevPanelSessionHeaders } from './dev-panel-session.server';

const sessionKey = 'sessionId';

const DEV_PENDING_ADMIN_NAME = 'Dr. Alan Brooks';
const DEV_PENDING_CLASS = { className: 'English 10', grade: '10' as const };

export type FreeTierJumpStep = { id: string; label: string; done: boolean };

export type FreeTierJumpResult =
  | {
      ok: true;
      redirectTo: string;
      steps: FreeTierJumpStep[];
      throwawayEmail?: string;
      headers: Headers;
    }
  | { ok: false; error: string };

type JumpInput = {
  request: Request;
  stateId: string;
  throwaway: boolean;
  currentUserId: string | null;
  organizationId: string;
};

async function ensureThrowawayTeacher(organizationId: string) {
  const email = `test+${randomUUID().slice(0, 8)}@yawp.local`;
  const passwordHash = bcrypt.hashSync(LOCAL_DEV_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email,
      name: 'Test Teacher',
      password: { create: { hash: passwordHash } },
      memberships: {
        create: {
          organizationId,
          role: 'TEACHER',
          isActive: true,
        },
      },
    },
    select: {
      id: true,
      email: true,
      memberships: { select: { id: true }, take: 1 },
    },
  });
  return {
    userId: user.id,
    email: user.email!,
    membershipId: user.memberships[0]!.id,
  };
}

async function ensureDevPanelTeacherSeat(userId: string, organizationId: string) {
  const existing = await prisma.orgMembership.findFirst({
    where: {
      userId,
      organizationId,
      isActive: true,
      role: 'TEACHER',
    },
    select: { id: true },
  });
  if (existing) return;
  await prisma.orgMembership.create({
    data: {
      userId,
      organizationId,
      role: 'TEACHER',
      isActive: true,
    },
  });
}

async function resolveTargetUser(input: JumpInput) {
  if (input.throwaway) {
    return ensureThrowawayTeacher(input.organizationId);
  }
  if (!input.currentUserId) {
    throw new Error('Sign in to jump without a throwaway test account.');
  }
  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId: input.currentUserId,
      organizationId: input.organizationId,
      isActive: true,
      role: 'TEACHER',
    },
    select: { id: true, user: { select: { id: true, email: true } } },
  });
  if (!membership?.user.email) {
    throw new Error('Current user is not an active teacher in this org.');
  }
  return {
    userId: membership.user.id,
    email: membership.user.email,
    membershipId: membership.id,
  };
}

async function upsertApplication(
  userId: string,
  email: string,
  status: string,
  extra: Record<string, unknown> = {}
) {
  return prisma.freeTierApplication.upsert({
    where: { email },
    create: {
      email,
      name: 'Test Teacher',
      schoolName: 'Lincoln High School',
      location: 'Local',
      gradeLevel: '10',
      status: status as never,
      userId,
      ...extra,
    },
    update: { status: status as never, userId, email, ...extra },
    select: { id: true, status: true },
  });
}

function pendingFixtureTeacherEmail(localPart: string, fixtureDomain: string) {
  return `${localPart}@${fixtureDomain}`;
}

async function alignTeacherEmailForPendingFixture(
  userId: string,
  email: string,
  fixtureDomain: string
) {
  if (emailDomain(email) === fixtureDomain) return email;
  const local =
    email.split('@')[0]?.replace(/[^a-zA-Z0-9._+-]/g, '').slice(0, 40) ||
    'dev-teacher';
  const aligned = pendingFixtureTeacherEmail(
    `${local}.${userId.slice(0, 8)}`,
    fixtureDomain
  );
  await prisma.user.update({ where: { id: userId }, data: { email: aligned } });
  return aligned;
}

async function resetApplicationForPendingJump(applicationId: string) {
  await prisma.$transaction(async (tx) => {
    const approvals = await tx.freeTierAdminApproval.findMany({
      where: { applicationId },
      select: { id: true },
    });
    const approvalIds = approvals.map((row) => row.id);
    if (approvalIds.length) {
      await tx.freeTierApprovalDelivery.updateMany({
        where: { approvalId: { in: approvalIds } },
        data: { state: 'CANCELLED', error: 'dev_panel_jump_reset' },
      });
      await tx.freeTierAdminApproval.deleteMany({
        where: { applicationId },
      });
    }
    await tx.freeTierApplication.update({
      where: { id: applicationId },
      data: {
        status: 'ACCOUNT_CREATED',
        organizationId: null,
        adminRedirectCount: 0,
        lockedPreviewApprovalToastSeenAt: null,
        starterClassName: DEV_PENDING_CLASS.className,
        starterClassGrade: DEV_PENDING_CLASS.grade,
      },
    });
  });
}

async function jumpToPendingTeacherState(args: {
  userId: string;
  email: string;
  manualReview: boolean;
  devPanelOrganizationId: string;
}) {
  const teacherDomain = `pending-${randomUUID().slice(0, 12)}.example.test`;
  const adminDomain = args.manualReview
    ? `review-${randomUUID().slice(0, 12)}.example.test`
    : teacherDomain;
  const adminEmail = `admin.fixture@${adminDomain}`;
  const teacherEmail = await alignTeacherEmailForPendingFixture(
    args.userId,
    args.email,
    teacherDomain
  );
  const app = await upsertApplication(args.userId, teacherEmail, 'ACCOUNT_CREATED', {
    starterClassName: DEV_PENDING_CLASS.className,
    starterClassGrade: DEV_PENDING_CLASS.grade,
    organizationId: null,
  });
  await resetApplicationForPendingJump(app.id);
  await saveClassPreparation({
    applicationId: app.id,
    userId: args.userId,
    ...DEV_PENDING_CLASS,
  });
  const submit = await submitAdminDetails({
    applicationId: app.id,
    userId: args.userId,
    adminName: DEV_PENDING_ADMIN_NAME,
    adminEmail,
    adminRole: 'Principal',
    suppressEmailDelivery: true,
  });
  if (!submit.ok) {
    throw new Error(
      submit.reason === 'email_failed'
        ? 'Could not prepare pending approval state.'
        : `Could not prepare pending approval state (${submit.reason}).`
    );
  }
  const expectedStatus = args.manualReview ? 'MANUAL_REVIEW' : 'SENT';
  if (submit.status !== expectedStatus) {
    throw new Error('Pending jump produced an unexpected application status.');
  }
  // Dev-panel throwaways attach to the selected org before provisioning; drop
  // that seat so free-tier provisioning matches the real signup path.
  await prisma.orgMembership.deleteMany({
    where: {
      userId: args.userId,
      organizationId: args.devPanelOrganizationId,
    },
  });
  await ensureLockedPreviewClassroomForUser(args.userId);
  const membership = await prisma.orgMembership.findFirst({
    where: {
      userId: args.userId,
      organization: { plan: 'FREE_CLASSROOM' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!membership) {
    throw new Error('Could not provision locked preview classroom.');
  }
  return { membershipId: membership.id };
}

async function seedMonthlyUsage(
  organizationId: string,
  lessonPlannerUsed: number,
  reporterUsed: number
) {
  const now = new Date();
  const period = lessonPlanMonthWindow(now).gte.toISOString();
  const prefix = (feature: 'lesson-planner' | 'reporter') =>
    `free_tier.monthly.v1:${organizationId}:${feature}:`;
  await prisma.setting.deleteMany({
    where: {
      OR: [
        { name: { startsWith: prefix('lesson-planner') } },
        { name: { startsWith: prefix('reporter') } },
      ],
    },
  });
  const writeCompleted = async (
    feature: 'lesson-planner' | 'reporter',
    count: number
  ) => {
    for (let index = 0; index < count; index++) {
      const name =
        prefix(feature) +
        createHash('sha256').update(`${feature}:${index}`).digest('hex');
      await prisma.setting.create({
        data: {
          name,
          valueType: 'json',
          value: JSON.stringify({
            period,
            fingerprint: name,
            status: 'completed',
            token: randomUUID(),
            expiresAt: new Date(+now + 60_000).toISOString(),
            payload: { devPanel: true },
          }),
        },
      });
    }
  };
  await writeCompleted('lesson-planner', lessonPlannerUsed);
  await writeCompleted('reporter', reporterUsed);
}

async function clearSignedInSession(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie')
  );
  const sessionId = authSession.get(sessionKey);
  if (sessionId) {
    await prisma.session.deleteMany({ where: { id: sessionId } });
  }
  authSession.unset(sessionKey);
  return combineHeaders(
    {
      'set-cookie': await authSessionStorage.commitSession(authSession),
    },
    { 'set-cookie': await setMembershipId('') }
  );
}

export async function executeFreeTierStateJump(
  input: JumpInput
): Promise<FreeTierJumpResult> {
  const found = findFreeTierState(input.stateId);
  if (!found) return { ok: false, error: 'Unknown state.' };

  const steps: FreeTierJumpStep[] = [
    { id: 'account', label: 'Made test account', done: false },
    { id: 'state', label: `Setting up ${found.state.label}`, done: false },
    { id: 'reload', label: 'Reloading Yawp!', done: false },
  ];

  try {
    if (
      found.state.id.startsWith('pending.') &&
      !input.throwaway &&
      input.currentUserId
    ) {
      await ensureDevPanelTeacherSeat(
        input.currentUserId,
        input.organizationId
      );
    }
    const target = await resolveTargetUser(input);
    steps[0].label = input.throwaway
      ? `Made test account: ${target.email}`
      : `Using ${target.email}`;
    steps[0].done = true;

    let redirectTo = '/app';
    let sessionMembershipId = target.membershipId;
    const { state } = found;

    if (state.adminSide) {
      const app = await upsertApplication(
        target.userId,
        target.email,
        state.id.includes('not-right') ? 'SENT' : 'SENT'
      );
      if (state.id === 'admin.approve-from-email') {
        await prisma.freeTierAdminApproval.deleteMany({
          where: { applicationId: app.id },
        });
        await prisma.freeTierAdminApproval.create({
          data: {
            applicationId: app.id,
            adminName: 'Dr. Alan Brooks',
            adminEmail: 'admin@example.test',
            status: 'PENDING',
            emailCopyVersionHash: 'dev-panel',
          },
        });
        const link = await mintSignedLink({
          applicationId: app.id,
          purpose: 'ADMIN_APPROVE',
          ttlMs: FREE_TIER_LINK_TTL_MS,
        });
        redirectTo = `${freeTierPublicAppOrigin()}/free/admin/approve?t=${encodeURIComponent(link.token)}`;
      } else {
        const link = await mintSignedLink({
          applicationId: app.id,
          purpose: 'ADMIN_NOT_RIGHT_PERSON',
          ttlMs: FREE_TIER_LINK_TTL_MS,
        });
        redirectTo = `${freeTierPublicAppOrigin()}/free/admin/not-right-person?t=${encodeURIComponent(link.token)}`;
      }
      steps[1].done = true;
      const headers = await clearSignedInSession(input.request);
      steps[2].done = true;
      return {
        ok: true,
        redirectTo,
        steps,
        throwawayEmail: input.throwaway ? target.email : undefined,
        headers,
      };
    }

    switch (state.id) {
      case 'signup.waitlist-submitted':
        await upsertApplication(target.userId, target.email, 'LEAD');
        redirectTo = '/free';
        break;
      case 'signup.account-created':
        await upsertApplication(target.userId, target.email, 'ACCOUNT_CREATED');
        redirectTo = '/app/free-tier/onboarding';
        break;
      case 'signup.onboarding-in-progress':
        await upsertApplication(target.userId, target.email, 'ACCOUNT_CREATED');
        redirectTo = '/app/free-tier/onboarding';
        break;
      case 'signup.email-verification':
        await upsertApplication(target.userId, target.email, 'INVITED');
        redirectTo = '/app/free-tier/onboarding';
        break;
      case 'signup.returning-lead': {
        const app = await upsertApplication(target.userId, target.email, 'LEAD');
        const link = await mintSignedLink({
          applicationId: app.id,
          purpose: 'RELEASE',
          ttlMs: FREE_TIER_LINK_TTL_MS,
        });
        redirectTo = `${freeTierPublicAppOrigin()}/free/join?t=${encodeURIComponent(link.token)}`;
        break;
      }
      case 'pending.waiting-on-admin': {
        const pending = await jumpToPendingTeacherState({
          userId: target.userId,
          email: target.email,
          manualReview: false,
          devPanelOrganizationId: input.organizationId,
        });
        sessionMembershipId = pending.membershipId;
        redirectTo = '/app/free-tier/pending';
        break;
      }
      case 'pending.manual-review': {
        const pending = await jumpToPendingTeacherState({
          userId: target.userId,
          email: target.email,
          manualReview: true,
          devPanelOrganizationId: input.organizationId,
        });
        sessionMembershipId = pending.membershipId;
        redirectTo = '/app/free-tier/pending';
        break;
      }
      case 'approved.first-time-toast':
      case 'approved.usage-plenty-left':
      case 'approved.usage-about-half-left':
      case 'approved.usage-a-few-left':
      case 'approved.usage-all-used':
      case 'approved.lesson-planner-limit':
      case 'approved.reporter-limit': {
        const app = await upsertApplication(
          target.userId,
          target.email,
          'APPROVED',
          { approvedAt: new Date() }
        );
        await provisionFreeClassroom(app.id);
        const org = await prisma.freeTierApplication.findUniqueOrThrow({
          where: { id: app.id },
          select: { organizationId: true },
        });
        if (org.organizationId) {
          await prisma.freeTierApplication.update({
            where: { id: app.id },
            data: {
              lockedPreviewApprovalToastSeenAt:
                state.id === 'approved.first-time-toast' ? null : new Date(),
            },
          });
          const usage =
            state.id === 'approved.usage-plenty-left'
              ? { lp: 1, rep: 0 }
              : state.id === 'approved.usage-about-half-left'
                ? { lp: 3, rep: 1 }
                : state.id === 'approved.usage-a-few-left'
                  ? { lp: 4, rep: 2 }
                  : state.id === 'approved.usage-all-used'
                    ? { lp: 5, rep: 2 }
                    : state.id === 'approved.lesson-planner-limit'
                      ? { lp: 5, rep: 0 }
                      : state.id === 'approved.reporter-limit'
                        ? { lp: 0, rep: 2 }
                        : { lp: 0, rep: 0 };
          await seedMonthlyUsage(org.organizationId, usage.lp, usage.rep);
        }
        redirectTo =
          state.id === 'approved.lesson-planner-limit'
            ? '/app/lesson-planner'
            : state.id === 'approved.reporter-limit'
              ? '/app/reporter'
              : '/app';
        break;
      }
      default:
        return { ok: false, error: 'State is not implemented yet.' };
    }

    steps[1].done = true;
    const sessionHeaders = await createDevPanelSessionHeaders(
      target.userId,
      sessionMembershipId,
      input.request
    );
    steps[2].done = true;
    return {
      ok: true,
      redirectTo,
      steps,
      throwawayEmail: input.throwaway ? target.email : undefined,
      headers: sessionHeaders,
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : 'Could not jump to this state.',
    };
  }
}
