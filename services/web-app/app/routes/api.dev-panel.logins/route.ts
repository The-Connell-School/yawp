import type { LoaderFunctionArgs } from 'react-router';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import { getLocalDevLoginOptionsPage } from '~/routes/auth.dev-login/dev-login.server';
import { prisma } from '~/utils/db.server';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  const url = new URL(request.url);
  const orgId = url.searchParams.get('orgId');
  const cursor = Number(url.searchParams.get('cursor') ?? '0') || 0;
  const previewSeat = isPreviewDevLoginAccessCodeRequired()
    ? await getPreviewAccessSeat(request)
    : null;
  const organizationId = previewSeat?.organizationId ?? orgId ?? undefined;
  const page = await getLocalDevLoginOptionsPage(organizationId, prisma, {
    cursor,
  });
  return Response.json(page, { headers: { 'cache-control': 'no-store' } });
}
