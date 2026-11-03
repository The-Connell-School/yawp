import type { LoaderFunctionArgs } from 'react-router';
import { assertDevPanelRoute } from '~/dev-panel/dev-panel-route-guard.server';
import { listDevPanelTeacherClasses } from '~/dev-panel/class-simulation.server';

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
