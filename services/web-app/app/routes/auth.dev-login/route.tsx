import {
  getSessionExpirationDate,
  sessionKey,
} from '~/utils/auth.server';
import { authSessionStorage } from '~/cookie-session-storages/authentication.server';
import { setMembershipId } from '~/cookies/membership-id.server';
import { prisma } from '~/utils/db.server';
import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';
import {
  getPreviewAccessSeat,
  isPreviewAccessGateEnabled,
} from '~/utils/preview-access.server';
import {
  createDevLoginAction,
  getLocalDevLoginOptions as getLoginOptions,
} from './dev-login.server';

export { createDevLoginAction } from './dev-login.server';

export const action = createDevLoginAction({
  prismaClient: prisma,
  getExpirationDate: getSessionExpirationDate,
  sessionKey,
  sessionStorage: authSessionStorage,
  membershipCookie: setMembershipId,
  localDevAuthEnabled: isLocalDevAuthEnabled,
  previewGateEnabled: isPreviewAccessGateEnabled,
  previewSeatForRequest: getPreviewAccessSeat,
  redirectResponse: (headers) =>
    new Response(null, { status: 302, headers }),
});

export function getLocalDevLoginOptions(organizationId?: string) {
  return getLoginOptions(organizationId, prisma);
}
