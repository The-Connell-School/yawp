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
  return (
    yawp === 'demo' || isDevPanelDemoHost(env) || isLocalDevPanelEnvironment(env)
  );
}

/** Runtime gate for HTTP handlers and root loader data. */
export function isDevPanelRuntimeEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (!isDevPanelBuildEnabled(env)) return false;
  const yawp = String(env.YAWP_ENVIRONMENT ?? '').trim().toLowerCase();
  if (yawp === 'demo' || isDevPanelDemoHost(env)) return true;
  // PR preview hosts keep the legacy environment beaker and dev-login menu.
  if (yawp === 'preview') return false;
  return isLocalDevPanelEnvironment(env);
}

function isLocalDevPanelEnvironment(env: NodeJS.ProcessEnv) {
  return (
    env.NODE_ENV === 'development' &&
    isLocalDatabaseUrl(String(env.DATABASE_URL ?? ''))
  );
}

/** Demo host only (render-compose sets PREVIEW_SLUG); not env.SLUG. */
function isDevPanelDemoHost(env: NodeJS.ProcessEnv) {
  const slug = String(env.PREVIEW_SLUG ?? '').trim();
  const prNumber = String(env.PR_NUMBER ?? '').trim();
  return slug === 'demo' && !prNumber;
}

export function devPanelEnvBadge(
  env: NodeJS.ProcessEnv = process.env
): 'Demo' | 'Dev' {
  const yawp = String(env.YAWP_ENVIRONMENT ?? '').trim().toLowerCase();
  return yawp === 'demo' || isDemoEnvironment(env) ? 'Demo' : 'Dev';
}

export function rejectDevPanelInProduction() {
  if (isDevPanelRuntimeEnabled()) return null;
  return Response.json({ error: 'Not found' }, {
    status: 404,
    headers: { 'cache-control': 'no-store' },
  });
}
