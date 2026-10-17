import { data } from 'react-router';
import { isFreeTierEnabled } from '~/domain/feature-flags/feature-flags.server';

export function isDemoFreeTierRouteOpen(env: Record<string, string | undefined>) {
  return (
    env.PREVIEW_SLUG?.trim().toLowerCase() === 'demo' ||
    env.YAWP_ENVIRONMENT?.trim().toLowerCase() === 'demo'
  );
}

/** Hide Free Tier C routes and APIs when the flag is off (404, not 403). */
export async function requireFreeTierEnabled(): Promise<void> {
  if (!isDemoFreeTierRouteOpen(process.env) && !(await isFreeTierEnabled())) {
    throw data({ error: 'Not found' }, { status: 404 });
  }
}
