/**
 * Request gate for the Teacher's Lounge community. 404 (not 403) for anyone
 * who may not use it, so the feature stays invisible while the flag is off
 * for a school and always for students.
 */
import { data } from 'react-router';
import { isLoungeCommunityEnabled } from '~/domain/feature-flags/feature-flags.server';
import { prisma } from '~/utils/db.server';
import {
  requireMembership,
  requireUserId,
  type RequiredMembership,
} from '~/utils/auth.server';
import { decideLoungeAccess } from './access';
import type { LoungeViewer } from './lounge.server';

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
    throw data({ error: "The Teacher's Lounge community is not available." }, { status: 404 });
  }
  return {
    viewer: { userId, isStaff: decision.isStaff },
    membership,
    organizationId: membership.organization.id,
  };
}
