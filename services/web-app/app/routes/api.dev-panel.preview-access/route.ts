import type { ActionFunctionArgs } from 'react-router';
import { assertDevPanelUnlockRoute } from '~/dev-panel/dev-panel-route-guard.server';
import {
  findPreviewAccessCredentialByCode,
  grantPreviewAccessCookie,
  isPreviewAccessConfigured,
} from '~/utils/preview-access.server';
import {
  checkPreviewAccessAttempt,
  clearFailedPreviewAccessAttempts,
  recordFailedPreviewAccessAttempt,
} from '~/utils/preview-access-rate-limit.server';

export async function action({ request }: ActionFunctionArgs) {
  const blocked = await assertDevPanelUnlockRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  if (!isPreviewAccessConfigured()) {
    return Response.json(
      { error: 'Preview access is not configured.' },
      { status: 503 }
    );
  }
  const body = await request.json().catch(() => null);
  const code = String(body?.code ?? '').trim();
  if (!code) {
    return Response.json({ error: 'Enter an access code.' }, { status: 400 });
  }
  const attempt = checkPreviewAccessAttempt(request);
  if (!attempt.allowed) {
    return Response.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429 }
    );
  }
  const credential = await findPreviewAccessCredentialByCode(code);
  if (!credential) {
    recordFailedPreviewAccessAttempt(request);
    return Response.json({ error: 'That access code did not work.' }, { status: 401 });
  }
  clearFailedPreviewAccessAttempts(request);
  // Dev panel unlock is seat-code only; master codes belong to the public preview-access flow.
  if (credential.kind !== 'organization') {
    recordFailedPreviewAccessAttempt(request);
    return Response.json(
      { error: 'That access code did not work.' },
      { status: 401 }
    );
  }
  const cookie = await grantPreviewAccessCookie(credential.seat);
  return Response.json(
    { ok: true, seatLabel: credential.seat.label },
    {
      headers: {
        'cache-control': 'no-store',
        'set-cookie': cookie,
      },
    }
  );
}
