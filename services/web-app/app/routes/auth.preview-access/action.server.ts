import { type ActionFunctionArgs } from 'react-router';
import { safeRedirect } from 'remix-utils/safe-redirect';
import {
  PREVIEW_ACCESS_PATH,
  clearPreviewAccessCookie,
  findPreviewAccessSeatByCode,
  grantPreviewAccessCookie,
  isPreviewAccessConfigured,
} from '~/utils/preview-access.server';

/**
 * Kept out of route.tsx on purpose.
 *
 * React Router strips the standard server-only route exports (loader, action) from the
 * client bundle, but it cannot strip an extra named export like this factory — so
 * declaring it beside the component dragged '~/utils/preview-access.server' into the
 * browser build and Vite refused it with "Server-only module referenced by client".
 */
type LogoutFunction = typeof import('~/utils/auth.server').logout;
type FindSeatFunction = typeof findPreviewAccessSeatByCode;

export function createPreviewAccessAction(
  logoutFunction?: LogoutFunction,
  findSeat: FindSeatFunction = findPreviewAccessSeatByCode
) {
  return async ({ request }: ActionFunctionArgs): Promise<Response> => {
    const formData = await request.formData();
    const intent = String(formData.get('intent') ?? 'enter');

    if (intent === 'sign-out') {
      const signOut =
        logoutFunction ?? (await import('~/utils/auth.server')).logout;
      await signOut(
        { request, redirectTo: PREVIEW_ACCESS_PATH },
        {
          headers: {
            'set-cookie': await clearPreviewAccessCookie(),
          },
        }
      );
      throw new Error('Preview access sign-out did not redirect.');
    }

    if (!isPreviewAccessConfigured()) {
      return Response.json(
        {
          error:
            'Preview access is not configured. Contact the deployment owner.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const code = String(formData.get('code') ?? '');
    const seat = await findSeat(code);
    if (!seat) {
      return Response.json(
        { error: 'That access code was not recognized.' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const returnTo = safeRedirect(String(formData.get('returnTo') ?? ''), '/');
    // A code switch must not leave an application login from the previous seat alive.
    // Reuse logout so both cookies are changed atomically in the redirect response.
    const signOut =
      logoutFunction ?? (await import('~/utils/auth.server')).logout;
    await signOut(
      { request, redirectTo: returnTo },
      {
        headers: {
          'Cache-Control': 'no-store',
          'set-cookie': await grantPreviewAccessCookie(seat),
        },
      }
    );
    throw new Error('Preview access entry did not redirect.');
  };
}
