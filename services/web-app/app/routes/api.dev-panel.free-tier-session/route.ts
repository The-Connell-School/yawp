import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import {
  loadFreeTierSessionSnapshot,
  renderFreeTierSessionEmailPreview,
} from '~/dev-panel/free-tier-session.server';
import { mintDevPanelFtTestEmail } from '~/dev-panel/free-tier-session-prefill';

export async function loader({ request }: LoaderFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  const url = new URL(request.url);
  const followEmail = url.searchParams.get('followEmail');
  const formFilled = url.searchParams.get('formFilled') === '1';
  const origin = url.origin;
  const snapshot = await loadFreeTierSessionSnapshot({
    followEmail,
    formFilled,
    origin,
  });
  return Response.json({ ok: true, snapshot });
}

export async function action({ request }: ActionFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const body = await request.json().catch(() => null);
  const actionName = String(body?.action ?? '');
  const origin = new URL(request.url).origin;

  if (actionName === 'mint-email') {
    return Response.json({ ok: true, email: mintDevPanelFtTestEmail() });
  }

  if (actionName === 'email-preview') {
    const emailLogId = String(body?.emailLogId ?? '');
    const followEmail = String(body?.followEmail ?? '');
    if (!emailLogId || !followEmail) {
      return Response.json({ error: 'Missing preview target.' }, { status: 400 });
    }
    const html = await renderFreeTierSessionEmailPreview({
      emailLogId,
      followEmail,
      origin,
    });
    if (!html) {
      return Response.json({ error: 'Preview unavailable.' }, { status: 404 });
    }
    return Response.json({ ok: true, html });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}
