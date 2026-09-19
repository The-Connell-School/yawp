/**
 * Access gate for the YAWP! Lesson Planner.
 *
 * The planner is rolled out gradually behind a per-organization flag
 * (`Organization.lessonPlannerEnabled`) and is teacher-only. The page loader,
 * the chat action, and the Class Summary hand-off all funnel through here so
 * the gate stays in one place.
 */
import { data } from 'react-router';
import {
  requireMembership,
  requireUserId,
  type RequiredMembership,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

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

  const organization = await prisma.organization.findUnique({
    where: { id: membership.organization.id },
    select: { lessonPlannerEnabled: true },
  });
  const enabled = Boolean(organization?.lessonPlannerEnabled);

  return {
    userId,
    membership,
    isTeacher,
    enabled,
    allowed: isTeacher && enabled,
  };
}

/**
 * Throw a 404 unless the caller is a teacher in a planner-enabled org. 404
 * (rather than 403) keeps the feature invisible to orgs that don't have it.
 */
export async function requireLessonPlannerAccess(
  request: Request
): Promise<LessonPlannerAccess> {
  const access = await getLessonPlannerAccess(request);
  if (!access.allowed) {
    throw data(
      { error: 'The YAWP! Lesson Planner is not available.' },
      { status: 404 }
    );
  }
  return access;
}
