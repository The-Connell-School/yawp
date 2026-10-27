import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import {
  createDevPanelSandboxClass,
  listDevPanelTeacherClasses,
} from '~/dev-panel/class-simulation.server';
import { getUserId } from '~/utils/auth.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  const result = await listDevPanelTeacherClasses(request);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(
    { classes: result.classes },
    { headers: { 'cache-control': 'no-store' } }
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const blocked = await assertDevPanelRoute(request);
  if (blocked) return blocked;
  if (request.method !== 'POST') {
    return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  }
  const userId = await getUserId(request);
  if (!userId) {
    return Response.json({ error: 'Sign in required.' }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (body?.intent !== 'create-sandbox') {
    return Response.json({ error: 'Invalid request.' }, { status: 400 });
  }
  const result = await createDevPanelSandboxClass({ userId });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json({ ok: true, class: result.class });
}
