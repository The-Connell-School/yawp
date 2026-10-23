import { type LoaderFunctionArgs } from 'react-router';
import { isDatabaseReady } from '~/utils/db-readiness.server';

export async function loader(_args: LoaderFunctionArgs) {
  const ok = await isDatabaseReady();
  return Response.json(
    { ok, db: ok ? 'ok' : 'error' },
    { status: ok ? 200 : 503 }
  );
}
