import { type LoaderFunctionArgs } from 'react-router';
import { isDatabaseReady } from '~/utils/db-readiness.server';

/** App Runner, ALB, and preview deploy scripts probe this path for stack health (includes DB). */
export async function loader(_args: LoaderFunctionArgs) {
  const ok = await isDatabaseReady();
  return new Response(ok ? 'OK' : 'UNAVAILABLE', { status: ok ? 200 : 503 });
}
