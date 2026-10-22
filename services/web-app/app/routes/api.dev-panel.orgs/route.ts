import type { LoaderFunctionArgs } from 'react-router';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import { listDevPanelOrganizations } from '~/dev-panel/dev-panel-orgs.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  const organizations = await listDevPanelOrganizations(request);
  return Response.json(
    { organizations },
    { headers: { 'cache-control': 'no-store' } }
  );
}
