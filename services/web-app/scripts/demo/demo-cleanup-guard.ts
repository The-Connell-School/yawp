import { assertDemoEnvironment } from './create-intern-testers-guard';

/** Demo DB cleanup must never run against production or non-demo databases. */
export function assertDemoCleanupTarget(
  env: Record<string, string | undefined>
) {
  assertDemoEnvironment(env);
  const databaseName = env.DATABASE_NAME?.trim();
  if (databaseName && databaseName !== 'yawp_demo') {
    throw new Error('DATABASE_NAME must be yawp_demo for demo DB cleanup.');
  }
  let url: URL;
  try {
    url = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('A valid demo DATABASE_URL is required.');
  }
  const pathDb = url.pathname.replace(/^\//, '').split('/')[0] ?? '';
  if (pathDb && pathDb !== 'yawp_demo') {
    throw new Error('DATABASE_URL path must target the yawp_demo database.');
  }
}

export const DEMO_CLEANUP_CONFIRMATION_PHRASE = 'APPLY yawp_demo';

export function assertDemoCleanupApplyConfirmation(
  env: Record<string, string | undefined>
) {
  const confirmation = env.DEMO_CLEANUP_CONFIRMATION?.trim();
  if (confirmation !== DEMO_CLEANUP_CONFIRMATION_PHRASE) {
    throw new Error(
      `Refusing destructive cleanup without DEMO_CLEANUP_CONFIRMATION="${DEMO_CLEANUP_CONFIRMATION_PHRASE}".`
    );
  }
}
