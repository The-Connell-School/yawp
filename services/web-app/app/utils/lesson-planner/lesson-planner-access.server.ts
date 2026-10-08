/**
 * Access gate for the YAWP! Lesson Planner.
 *
 * Teacher-only. Students and admins without a teacher role get a 404 so the
 * feature stays invisible to them. Free-plan orgs are limited by entitlements
 * when creating a new lesson plan conversation.
 */
import { data } from 'react-router';
import {
  requireMembership,
  requireUserId,
  type RequiredMembership,
} from '~/utils/auth.server';

export type LessonPlannerAccess = {
  userId: string;
  membership: RequiredMembership;
  isTeacher: boolean;
  allowed: boolean;
};

export async function getLessonPlannerAccess(
  request: Request
): Promise<LessonPlannerAccess> {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const isTeacher = membership.role === 'TEACHER';

  return {
    userId,
    membership,
    isTeacher,
    allowed: isTeacher,
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
      { error: 'The YAWP! Lesson Planner is not available.' },
      { status: 404 }
    );
  }
  return access;
}
