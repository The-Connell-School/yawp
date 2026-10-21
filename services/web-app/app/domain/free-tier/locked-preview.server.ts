import type { Prisma } from '@app/prisma';
import { redirect } from 'react-router';
import { prisma } from '~/utils/db.server';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import {
  isLockedPreviewRequestAllowed,
  isLockedPreviewStatus,
  LOCKED_PREVIEW_APP_HOME,
  LOCKED_PREVIEW_MESSAGE,
  LOCKED_PREVIEW_PATH,
} from './locked-preview';
import { provisionFreeClassroom } from './provision-free-classroom.server';

/** Pending approval from the teacher's own application — not membership cookie or org. */
export async function userHasPendingFreeTierTeachingLock(
  userId: string
): Promise<boolean> {
  try {
    const app = await prisma.freeTierApplication.findFirst({
      where: { userId },
      select: { status: true, organizationId: true },
    });
    if (!app || !isLockedPreviewStatus(app.status)) return false;
    if (
      !(await isFeatureFlagEnabled(FREE_TIER_FLAG, app.organizationId ?? undefined))
    ) {
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

export async function getLockedPreviewApplication(userId: string, membershipId?: string | null) {
  const app = await prisma.freeTierApplication.findFirst({
    where: { userId },
    select: { id: true, status: true, organizationId: true },
  });
  if (!app || !isLockedPreviewStatus(app.status) ||
      !(await isFeatureFlagEnabled(FREE_TIER_FLAG, app.organizationId))) return null;
  const memberships = await prisma.orgMembership.findMany({
    where: { userId, isActive: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true, role: true, organizationId: true, organization: { select: { plan: true } } },
  });
  const member = membershipId
    ? memberships.find(m => m.id === membershipId)
    : memberships.find(m => m.organizationId !== 'default-org') ?? memberships[0];
  // Approval provisions the first real membership. An application is the
  // teacher identity here; never create an organization just to preview it.
  if (!member && !membershipId && !memberships.length && !app.organizationId) return app;
  if (!member || member.role !== 'TEACHER' ||
      (member.organizationId !== 'default-org' && member.organization.plan !== 'FREE_CLASSROOM') ||
      member.organizationId !== (app.organizationId ?? 'default-org')) return null;
  return app;
}

/** Runs during authentication, before any loader/action, including resource APIs. */
export async function enforceLockedPreviewRequest(request: Request, userId: string, membershipId?: string | null) {
  const pathname = new URL(request.url).pathname;
  if (!(pathname === '/app' || pathname.startsWith('/app/') || pathname.startsWith('/api/'))) return;
  if (!(await userHasPendingFreeTierTeachingLock(userId))) return;
  if (isLockedPreviewRequestAllowed(request.method, pathname)) return;
  if (['GET', 'HEAD'].includes(request.method))
    throw redirect(LOCKED_PREVIEW_APP_HOME);
  throw Response.json({ error: 'approval_required', message: LOCKED_PREVIEW_MESSAGE }, { status: 403 });
}

/** Provisions the browse-only classroom once the teacher is waiting on approval. */
export async function shouldHideFreeTierTeachingSecrets(userId: string) {
  return userHasPendingFreeTierTeachingLock(userId);
}

export async function ensureLockedPreviewClassroomForUser(userId: string) {
  const application = await prisma.freeTierApplication.findFirst({
    where: {
      userId,
      organizationId: null,
      status: { in: ['SENT', 'MANUAL_REVIEW'] },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, organizationId: true },
  });
  if (!application) return null;
  if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG, application.organizationId)))
    return null;
  const result = await provisionFreeClassroom(application.id);
  const organizationId =
    result.status === 'provisioned' || result.status === 'already_provisioned'
      ? result.organizationId
      : null;
  if (organizationId) {
    const { ensureLockedPreviewSampleAssignments } =
      await import('./locked-preview-class-seed.server');
    const klass = await prisma.class.findFirst({
      where: {
        isArchived: false,
        school: { organizationId },
        teachers: { some: { userId } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (klass) {
      await ensureLockedPreviewSampleAssignments(organizationId, klass.id);
    }
  }
  return result;
}

export type TeachingApprovalScope = {
  /** Pending SENT/MANUAL_REVIEW orgs may run Lesson Planner metering only. */
  allowPendingLessonPlanner?: true;
};

/** Transaction-aware backstop for enrollment and assignment writers without a Request. */
export async function assertOrganizationTeachingApproved(
  tx: Pick<Prisma.TransactionClient, 'organization' | 'freeTierApplication'>,
  organizationId: string,
  scope?: TeachingApprovalScope
) {
  if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG, organizationId))) return;
  const org = await tx.organization.findUnique({ where: { id: organizationId }, select: { plan: true } });
  if (org?.plan !== 'FREE_CLASSROOM') return;
  const app = await tx.freeTierApplication.findFirst({
    where: { organizationId }, orderBy: { createdAt: 'desc' }, select: { status: true },
  });
  if (app && isLockedPreviewStatus(app.status)) {
    if (
      scope?.allowPendingLessonPlanner &&
      (app.status === 'SENT' || app.status === 'MANUAL_REVIEW')
    ) {
      return;
    }
    throw Response.json({ error: 'approval_required', message: LOCKED_PREVIEW_MESSAGE }, { status: 403 });
  }
}

/** Fail-closed helper for Lesson Planner when monthly metering cannot be resolved. */
export async function organizationHasPendingFreeTierLessonPlannerMetering(
  organizationId: string
): Promise<boolean> {
  try {
    if (!(await isFeatureFlagEnabled(FREE_TIER_FLAG, organizationId))) return false;
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { plan: true },
    });
    if (org?.plan !== 'FREE_CLASSROOM') return false;
    const app = await prisma.freeTierApplication.findFirst({
      where: {
        organizationId,
        status: { in: ['SENT', 'MANUAL_REVIEW'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return Boolean(app);
  } catch {
    return true;
  }
}
