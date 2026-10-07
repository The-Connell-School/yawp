import type { LoaderFunctionArgs } from 'react-router';
import { requireSuperAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { mintSignedLink } from '~/domain/free-tier/signed-link.server';
import { getDomainUrl } from '~/utils/misc';
const SHIP_REVIEW_PENDING_EMAIL = 'shipreview-pending@yawp.invalid';
const SHIP_REVIEW_RELEASE_EMAIL = 'shipreview-released@yawp.invalid';

function notFound() {
  return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
}

/** Preview-only: mint signed URLs for ship-review Playwright (superadmin + preview gate). */
export async function loader({ request }: LoaderFunctionArgs) {
  if (process.env.YAWP_ENVIRONMENT !== 'preview') return notFound();
  await requireSuperAdmin(request);

  const email = new URL(request.url).searchParams.get('email')?.trim().toLowerCase();
  if (!email) {
    return Response.json({ error: 'email query param required' }, { status: 400 });
  }

  const app = await prisma.freeTierApplication.findUnique({
    where: { email },
    select: { id: true, status: true },
  });
  if (!app) {
    return Response.json({ error: 'application_not_found' }, { status: 404 });
  }

  const base = getDomainUrl(request);
  const out: Record<string, string> = { applicationId: app.id, status: app.status };

  if (app.status === 'INVITED' || email === SHIP_REVIEW_RELEASE_EMAIL) {
    const release = await mintSignedLink({ applicationId: app.id, purpose: 'RELEASE' });
    out.joinUrl = `${base}/free/join?t=${encodeURIComponent(release.token)}`;
  }

  if (
    app.status === 'SENT' ||
    app.status === 'MANUAL_REVIEW' ||
    email === SHIP_REVIEW_PENDING_EMAIL
  ) {
    const approve = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_APPROVE' });
    const decline = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_NOT_RIGHT_PERSON' });
    out.approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(approve.token)}`;
    out.declineUrl = `${base}/free/admin/not-right-person?t=${encodeURIComponent(decline.token)}`;
  }

  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
