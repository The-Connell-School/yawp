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

/**
 * The real-dependency wiring lives here rather than in route.tsx.
 *
 * React Router only strips the standard server exports (loader, action) from the client
 * bundle. Any other named export on a route module — a re-exported factory, a helper the
 * root loader imports — keeps its imports in the browser build, and Vite then refuses the
 * route with "Server-only module referenced by client". That broke dev login on the
 * preview box: '~/utils/db.server' reached the client through route.tsx's extra exports.
 */
export const devLoginAction = createDevLoginAction({
  prismaClient: prisma,
  getExpirationDate: getSessionExpirationDate,
  sessionKey,
  sessionStorage: authSessionStorage,
  membershipCookie: setMembershipId,
  localDevAuthEnabled: isLocalDevAuthEnabled,
  previewGateEnabled: isPreviewAccessGateEnabled,
  previewSeatForRequest: getPreviewAccessSeat,
  redirectResponse: (headers) => new Response(null, { status: 302, headers }),
});

export function getLocalDevLoginOptions(organizationId?: string) {
  return getLoginOptions(organizationId, prisma);
}
