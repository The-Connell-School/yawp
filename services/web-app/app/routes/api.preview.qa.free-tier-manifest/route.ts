import type { LoaderFunctionArgs } from 'react-router';
import { requireSuperAdmin } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

function notFound() {
  return new Response('Not Found', { status: 404, headers: { 'cache-control': 'no-store' } });
}

/** Preview-only: read last emailed signed URLs for ship-review Playwright (no minting). */
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

  const out: Record<string, string> = { applicationId: app.id, status: app.status };

  const releaseLog = await prisma.freeTierEmailLog.findFirst({
    where: { applicationId: app.id, kind: 'release', success: true },
    orderBy: { createdAt: 'desc' },
    select: { payload: true },
  });
  const releasePayload = releaseLog?.payload as { joinUrl?: string } | null;
  if (releasePayload?.joinUrl) {
    out.joinUrl = releasePayload.joinUrl;
  } else if (app.status === 'INVITED' || app.status === 'LEAD') {
    const joinLink = await prisma.freeTierSignedLink.findFirst({
      where: {
        applicationId: app.id,
        purpose: 'JOIN',
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      select: { token: true },
    });
    if (joinLink?.token) {
      const base = process.env.PRIMARY_APP_URL?.replace(/\/$/, '') || new URL(request.url).origin;
      out.joinUrl = `${base}/free/join?t=${encodeURIComponent(joinLink.token)}`;
    }
  }

  const approvalLog = await prisma.freeTierEmailLog.findFirst({
    where: {
      applicationId: app.id,
      kind: { in: ['admin_approval', 'admin_approval_reminder'] },
      success: true,
    },
    orderBy: { createdAt: 'desc' },
    select: { payload: true },
  });
  const approvalPayload = approvalLog?.payload as { approveUrl?: string; notRightPersonUrl?: string } | null;
  if (approvalPayload?.approveUrl) out.approveUrl = approvalPayload.approveUrl;
  if (approvalPayload?.notRightPersonUrl) out.declineUrl = approvalPayload.notRightPersonUrl;

  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
