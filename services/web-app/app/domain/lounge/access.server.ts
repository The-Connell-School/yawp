/**
 * Request gate for the Teacher's Lounge community. 404 (not 403) for anyone
 * who may not use it, so the feature stays invisible while the flag is off
 * for a school and always for students.
 */
import { data, redirect } from 'react-router';
import { isLoungeCommunityEnabled } from '~/domain/feature-flags/feature-flags.server';
import { prisma } from '~/utils/db.server';
import {
  requireMembership,
  requireUserId,
  type RequiredMembership,
} from '~/utils/auth.server';
import { decideLoungeAccess } from './access';
import { getLoungeProfile, type LoungeViewer } from './lounge.server';

export type LoungeAccess = {
  viewer: LoungeViewer;
  membership: RequiredMembership;
  organizationId: string;
};

export async function requireLoungeAccess(request: Request): Promise<LoungeAccess> {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);
  const [user, flagOn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    isLoungeCommunityEnabled(membership.organization.id),
  ]);
  const decision = decideLoungeAccess({
    role: membership.role,
    isActive: membership.isActive,
    isAdmin: Boolean(user?.isAdmin),
    flagOn,
  });
  if (!decision.allowed) {
    throw data({ error: 'The Faculty Lounge is not available.' }, { status: 404 });
  }
  return {
    viewer: { userId, isStaff: decision.isStaff },
    membership,
    organizationId: membership.organization.id,
  };
}

/** Lounge pages a teacher may be sent back to after the welcome box. */
export function safeLoungeReturnPath(value: string | null | undefined): string {
  if (value && /^\/app\/lounge(\/[A-Za-z0-9_-]+)?$/.test(value) && value !== '/app/lounge/welcome') return value;
  return '/app/lounge';
}

/**
 * requireLoungeAccess, plus the first-visit welcome box: a teacher who has
 * not agreed to the House Rules is sent there first, once. The YAWP! team
 * skips it.
 */
export async function requireLoungeMember(request: Request): Promise<LoungeAccess> {
  const access = await requireLoungeAccess(request);
  if (!access.viewer.isStaff) {
    const profile = await getLoungeProfile(access.viewer.userId);
    if (!profile) {
      const back = safeLoungeReturnPath(new URL(request.url).pathname);
      throw redirect(`/app/lounge/welcome?redirectTo=${encodeURIComponent(back)}`);
    }
  }
  return access;
}

/**
 * The Lounge viewer for someone who is already signed in, or null if they may
 * not use the Lounge. Never throws, for pages outside the Lounge that only
 * want to honor a link from it.
 */
export async function loungeViewerOrNull(
  userId: string,
  membership: Pick<RequiredMembership, 'role' | 'isActive' | 'organization'>
): Promise<LoungeViewer | null> {
  const [user, flagOn] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } }),
    isLoungeCommunityEnabled(membership.organization.id),
  ]);
  const decision = decideLoungeAccess({
    role: membership.role,
    isActive: membership.isActive,
    isAdmin: Boolean(user?.isAdmin),
    flagOn,
  });
  return decision.allowed ? { userId, isStaff: decision.isStaff } : null;
}
