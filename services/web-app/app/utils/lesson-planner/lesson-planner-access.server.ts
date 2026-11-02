/**
 * Access gate for the Yawp! Lesson Planner.
 *
 * Teacher-only, and gated by the free-tier rollout and the Lesson Planner
 * feature flag for the teacher's school. Students get a 404 so the feature
 * stays invisible to them.
 */
import { data } from 'react-router';
import {
  requireMembership,
  requireUserId,
  type RequiredMembership,
} from '~/utils/auth.server';
import type { Organization } from '@app/prisma';
import { isLessonPlannerEnabled } from '~/domain/feature-flags/feature-flags.server';
import { monthlyFreeTierPolicy } from '~/domain/free-tier/monthly-policy.server';
import { isDevPanelRuntimeEnabled } from '~/dev-panel/dev-panel-runtime.server';

export type LessonPlannerAccess = {
  userId: string;
  membership: RequiredMembership;
  isTeacher: boolean;
  enabled: boolean;
  allowed: boolean;
};

/** Production: free-tier capability and lesson_planner flag. Local dev panel: also approved FREE_CLASSROOM. */
export async function isLessonPlannerEnabledForOrganization(
  organization: Pick<Organization, 'id' | 'plan'>
): Promise<boolean> {
  if (await isLessonPlannerEnabled(organization.id)) return true;
  if (!isDevPanelRuntimeEnabled()) return false;
  if (organization.plan !== 'FREE_CLASSROOM') return false;
  const policy = await monthlyFreeTierPolicy(organization);
  return policy.enabled;
}

export async function getLessonPlannerAccess(
  request: Request
): Promise<LessonPlannerAccess> {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const isTeacher = membership.role === 'TEACHER';
  const enabled = await isLessonPlannerEnabledForOrganization(
    membership.organization
  );

  return {
    userId,
    membership,
    isTeacher,
    enabled,
    allowed: isTeacher && enabled,
  };
}

/**
 * Throw a 404 unless the caller is a teacher. 404 (rather than 403) keeps the
 * feature invisible to students and other roles.
 */
export async function requireLessonPlannerAccess(
  request: Request
): Promise<LessonPlannerAccess> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) {
    throw data(
      { error: 'The Yawp! Lesson Planner is not available.' },
      { status: 404 }
    );
  }
  return access;
}
