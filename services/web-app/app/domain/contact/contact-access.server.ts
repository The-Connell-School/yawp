import { data } from 'react-router';
import { TEACHER_CONTACT_US_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import type { LoungeViewer } from '~/domain/lounge/lounge.server';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { decideContactAccess } from './contact-access';

/**
 * Contact Us from the teacher dashboard. Unlike the Lounge's Contact Us it
 * does not ask the teacher to join the Lounge first; it only needs the
 * teacher_contact_us flag for their school. 404 otherwise.
 */
export async function requireTeacherContact(
  request: Request
): Promise<{ viewer: LoungeViewer; organizationId: string }> {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const [user, flagOn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    isFeatureFlagEnabled(TEACHER_CONTACT_US_FLAG, membership.organization.id),
  ]);
  const isAdmin = Boolean(user?.isAdmin);
  if (!decideContactAccess({ role: membership.role, isActive: membership.isActive, isAdmin, flagOn })) {
    throw data({ error: 'Not found' }, { status: 404 });
  }
  return { viewer: { userId, isStaff: isAdmin }, organizationId: membership.organization.id };
}

export async function isTeacherContactEnabled(organizationId: string): Promise<boolean> {
  return isFeatureFlagEnabled(TEACHER_CONTACT_US_FLAG, organizationId);
}
