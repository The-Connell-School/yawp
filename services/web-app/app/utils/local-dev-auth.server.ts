import { isLocalDatabaseUrl } from '../../../../packages/prisma/scripts/local-dev/database-url';

/**
 * Whether the role-swap ("login as") tools may be exposed.
 *
 * Two ways to earn it, and both fail closed:
 *
 * 1. A deployed environment with the in-app preview access gate enabled. The root route
 *    middleware reads PREVIEW_ACCESS_GATE itself and blocks every descendant loader,
 *    action, and API/resource route before it runs (except /api/healthcheck and the gate
 *    form). The flag is therefore the enforcement switch, not a claim about a separate
 *    proxy, so it cannot enable role-swap without also putting the gate in front of it.
 * 2. A developer's own machine: NODE_ENV=development against a local database.
 *
 * Production-dump data is excluded either way. Real people's records are not a safe place
 * to hand out an arbitrary identity, whoever is behind the door.
 *
 * The previous rule inferred "this must be local" from NODE_ENV plus the shape of
 * DATABASE_URL. Preview boxes run the dev server against a container-local Postgres, so
 * they satisfied both, and passwordless admin impersonation was live on public preview
 * URLs (confirmed 2026-07-30: anonymous POST /auth/dev-login returned 302 with session
 * cookies). The inference was the bug; this asks for an explicit signal instead.
 */
export function isLocalDevAuthEnabled() {
  if (process.env.PREVIEW_DATA_MODE === 'production-dump') {
    return false;
  }

  if (process.env.PREVIEW_ACCESS_GATE === 'on') {
    return true;
  }

  return (
    process.env.NODE_ENV === 'development' &&
    isLocalDatabaseUrl(process.env.DATABASE_URL ?? '')
  );
}
