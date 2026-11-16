import { getUserId } from '~/utils/auth.server.ts';
import { redirectWithToast } from '~/utils/toast.server';
import type { VerifyInvitationInput } from './verify-invitation.schema';

export type VerifyInvitationResult =
  | { ok: true; response: Response }
  | { ok: false; fieldErrors: Record<string, string> };

type InviteType = VerifyInvitationInput['type'];

const NEUTRAL_TOAST = {
  title: 'This invitation is no longer available',
  description:
    'This invite was already used or has expired. Sign in to continue.',
} as const;

export async function redirectIfInvitationAlreadyFulfilled({
  request,
  type,
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

  let signedIn = false;
  if (request) {
    try {
      signedIn = (await getUserId(request)) !== null;
    } catch {
      signedIn = false;
    }
  }

  const destination = signedIn ? '/app' : '/auth/login?redirectTo=%2Fapp';

  return {
    ok: true,
    response: await redirectWithToast(destination, NEUTRAL_TOAST),
  };
}