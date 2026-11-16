import { prisma } from '~/utils/db.server.ts';
import { getUserId } from '~/utils/auth.server.ts';
import { setMembershipId } from '~/cookies/membership-id.server';
import { redirectWithToast } from '~/utils/toast.server';
import type { VerifyInvitationInput } from './verify-invitation.schema';

export type VerifyInvitationResult =
  | { ok: true; response: Response }
  | { ok: false; fieldErrors: Record<string, string> };

type InviteType = VerifyInvitationInput['type'];

export async function redirectIfInvitationAlreadyFulfilled({
  request,
  type,
  normalizedTarget,
}: {
  request: Request | null;
  type: InviteType;
  normalizedTarget: string;
}): Promise<VerifyInvitationResult | null> {
  if (
    type !== 'onboard-student' &&
    type !== 'onboard-teacher' &&
    type !== 'onboard-owner'
  ) {
    return null;
  }

  const user = await prisma.user.findFirst({
    where: {
      email: { equals: normalizedTarget, mode: 'insensitive' },
    },
    select: {
      id: true,
      memberships: {
        select: { id: true, role: true, isOrgOwner: true },
      },
    },
  });

  if (!user) return null;

  const signedInUserId = request ? await getUserId(request).catch(() => null) : null;
  const isSignedInAsInvitee = signedInUserId === user.id;

  if (type === 'onboard-student') {
    return {
      ok: true,
      response: await redirectWithToast(
        isSignedInAsInvitee ? '/app' : '/auth/login?redirectTo=%2Fapp',
        {
          title: isSignedInAsInvitee
            ? 'You already have an account'
            : 'Sign in to join your class',
          description: isSignedInAsInvitee
            ? 'This invitation was already accepted. You are signed in.'
            : 'You already have a Yawp! account with this email. Sign in to finish joining the class.',
        }
      ),
    };
  }

  if (type === 'onboard-teacher') {
    const teacherMembership = user.memberships.find((m) => m.role === 'TEACHER');
    if (!teacherMembership) return null;

    const headers =
      isSignedInAsInvitee && teacherMembership
        ? {
            headers: {
              'set-cookie': await setMembershipId(teacherMembership.id),
            },
          }
        : undefined;

    return {
      ok: true,
      response: await redirectWithToast(
        '/app',
        {
          title: 'Invitation already accepted',
          description: isSignedInAsInvitee
            ? 'You are signed in. Your teacher account is ready.'
            : 'This teacher invitation was already accepted. Sign in to continue.',
        },
        headers
      ),
    };
  }

  if (type === 'onboard-owner') {
    const ownerMembership = user.memberships.find((m) => m.isOrgOwner);
    if (!ownerMembership) return null;

    const headers =
      isSignedInAsInvitee && ownerMembership
        ? {
            headers: {
              'set-cookie': await setMembershipId(ownerMembership.id),
            },
          }
        : undefined;

    return {
      ok: true,
      response: await redirectWithToast(
        '/app',
        {
          title: 'Invitation already accepted',
          description: isSignedInAsInvitee
            ? 'You are signed in. Your school owner account is ready.'
            : 'This owner invitation was already accepted. Sign in to continue.',
        },
        headers
      ),
    };
  }

  return null;
}