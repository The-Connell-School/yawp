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
import { monthlyFreeTierPolicy } from '~/domain/free-tier/monthly-policy.server';
import { isLessonPlannerEnabled } from '~/domain/feature-flags/feature-flags.server';

export type LessonPlannerAccess = {
  userId: string;
  membership: RequiredMembership;
  isTeacher: boolean;
  enabled: boolean;
  allowed: boolean;
};

export async function getLessonPlannerAccess(
  request: Request
): Promise<LessonPlannerAccess> {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const isTeacher = membership.role === 'TEACHER';
  const orgFlagOn = await isLessonPlannerEnabled(membership.organization.id);
  const freeTierMetering =
    isTeacher && membership.organization.plan === 'FREE_CLASSROOM'
      ? (await monthlyFreeTierPolicy(membership.organization))
          .lessonPlannerMeteringEnabled
      : false;
  const enabled = orgFlagOn || freeTierMetering;

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
