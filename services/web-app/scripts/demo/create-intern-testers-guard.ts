/** Fail closed before importing anything that can construct a database client. */
export function assertDemoEnvironment(env: Record<string, string | undefined>) {
  const markers = [env.APP_ENV, env.DEPLOY, env.DEPLOY_ENV, env.ENVIRONMENT]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLowerCase());
  if (markers.some((value) => /prod/i.test(value)) || /prod/i.test(env.DATABASE_SCHEMA ?? '')) {
    throw new Error('Refusing production environment. This script is demo-only.');
  }
  if (!markers.length || markers.some((value) => value !== 'demo')) {
    throw new Error('Set APP_ENV or DEPLOY to demo; all deployment markers must agree.');
  }
  // The application client prefers this override; never allow an unchecked target.
  if (env.E2E_DATABASE_URL) throw new Error('Unset E2E_DATABASE_URL for this demo script.');
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('A valid demo DATABASE_URL is required.');
  }
  const target = decodeURIComponent(`${url.hostname}${url.pathname}${url.search}`);
  if (/prod/i.test(target)) {
    throw new Error('Refusing a production database target.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !/(^|[.-])demo([.-]|$)/i.test(url.hostname)) {
    throw new Error('DATABASE_URL must identify a demo PostgreSQL host.');
  }
}
