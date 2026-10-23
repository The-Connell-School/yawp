import { isLocalDevAuthEnabled } from '~/utils/local-dev-auth.server';
import {
  getPreviewAccessSeat,
  isPreviewDevLoginAccessCodeRequired,
} from '~/utils/preview-access.server';
import { rejectDevPanelInProduction } from './dev-panel-runtime.server';

export async function assertDevPanelRoute(request: Request) {
  const blocked = rejectDevPanelInProduction();
  if (blocked) return blocked;
  if (!isLocalDevAuthEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  if (isPreviewDevLoginAccessCodeRequired()) {
    const seat = await getPreviewAccessSeat(request);
    if (!seat) {
      return Response.json(
        { error: 'Preview access code required.' },
        { status: 401 }
      );
    }
  }
  return null;
}

/** Preview-access unlock: same env gates as assertDevPanelRoute, but no seat cookie yet. */
export async function assertDevPanelUnlockRoute(_request: Request) {
  const blocked = rejectDevPanelInProduction();
  if (blocked) return blocked;
  if (!isLocalDevAuthEnabled()) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}
