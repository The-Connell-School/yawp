import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';
import { isDemoEnvironment } from '~/utils/preview-access.server';

/** True when this build may include dev-panel client modules (never production). */
export function isDevPanelBuildEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const yawp = String(env.YAWP_ENVIRONMENT ?? '').trim().toLowerCase();
  if (yawp === 'production') return false;
  if (process.env.NODE_ENV === 'test' && env.FORCE_DEV_PANEL_BUILD === '1') {
    return true;
  }
  return yawp === 'demo' || isLocalDevPanelEnvironment(env);
}

/** Runtime gate for HTTP handlers and root loader data. */
export function isDevPanelRuntimeEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isDevPanelBuildEnabled(env)) return false;
  const yawp = String(env.YAWP_ENVIRONMENT ?? '').trim().toLowerCase();
  if (yawp === 'demo' || isDemoEnvironment(env)) return true;
  return isLocalDevPanelEnvironment(env);
}

function isLocalDevPanelEnvironment(env: NodeJS.ProcessEnv) {
  return (
    env.NODE_ENV === 'development' &&
    isLocalDatabaseUrl(String(env.DATABASE_URL ?? ''))
  );
}

export function devPanelEnvBadge(
  env: NodeJS.ProcessEnv = process.env
): 'Demo' | 'Dev' {
  return isDemoEnvironment(env) ? 'Demo' : 'Dev';
}

export function rejectDevPanelInProduction() {
  if (isDevPanelRuntimeEnabled()) return null;
  return Response.json({ error: 'Not found' }, {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}
