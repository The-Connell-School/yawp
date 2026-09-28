/**
 * Access gate for the Yawp Reporter.
 *
 * Reporter is always on for all organizations and is teacher-only.
 * Both the page loader and the chat action funnel through here so the
 * teacher-only gate stays in one place.
 */
import { data } from 'react-router';
import {
  requireMembership,
  requireUserId,
  type RequiredMembership,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export type ReporterAccess = {
  userId: string;
  membership: RequiredMembership;
  isTeacher: boolean;
  enabled: boolean;
  allowed: boolean;
};

export async function getReporterAccess(
  request: Request
): Promise<ReporterAccess> {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const isTeacher = membership.role === 'TEACHER';
  // Reporter is now always enabled for all organizations.
  const enabled = true;

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
 * feature invisible to non-teachers.
 */
export async function requireReporterAccess(
  request: Request
): Promise<ReporterAccess> {
  const access = await getReporterAccess(request);
  if (!access.allowed) {
    throw data({ error: 'Yawp Reporter is not available.' }, { status: 404 });
  }
  return access;
}
