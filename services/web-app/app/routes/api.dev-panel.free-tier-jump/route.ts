import type { ActionFunctionArgs } from 'react-router';
import { assertDevPanelOrganizationInSeatScope } from '~/dev-panel/dev-panel-orgs.server';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import { executeFreeTierStateJump } from '~/dev-panel/free-tier-jump.server';
import { getUserId } from '~/utils/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const body = await request.json().catch(() => null);
  const stateId = String(body?.stateId ?? '');
  const throwaway = body?.throwaway !== false;
  const organizationId = String(body?.organizationId ?? '');
  if (!stateId || !organizationId) {
    return Response.json({ error: 'Missing state or organization.' }, { status: 400 });
  }
  const orgBlocked = await assertDevPanelOrganizationInSeatScope(
    request,
    organizationId
  );
  if (orgBlocked) return orgBlocked;
  const currentUserId = await getUserId(request);
  const result = await executeFreeTierStateJump({
    request,
    stateId,
    throwaway,
    currentUserId,
    organizationId,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: 400 });
  }
  return Response.json(
    {
      ok: true,
      redirectTo: result.redirectTo,
      steps: result.steps,
      throwawayEmail: result.throwawayEmail,
    },
    { headers: result.headers }
  );
}
