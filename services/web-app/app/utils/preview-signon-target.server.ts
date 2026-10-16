import { isYawpPrPreviewDatabase } from './preview-email-capture.server';

/** Exact DB, role, host and PR identity; reject pg target/schema overrides too. */
export function assertPreviewSignonTarget(
  env: Record<string, string | undefined> = process.env
) {
  const fail = () => {
    throw new Error(
      'Sign-on fixtures require an isolated PR preview in seed mode'
    );
  };
  if (
    env.YAWP_ENVIRONMENT !== 'preview' ||
    env.PREVIEW_DATA_MODE !== 'seed' ||
    env.DATABASE_SCHEMA
  )
    fail();
  try {
    const url = new URL(env.DATABASE_URL ?? '');
    const name = url.pathname.slice(1);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.search ||
      url.hash ||
      !isYawpPrPreviewDatabase(name) ||
      url.pathname !== `/${name}` ||
      env.PREVIEW_SLUG !== `pr-${name.slice('yawp_pr_'.length)}` ||
      url.username !== `${name}_app` ||
      !['preview-postgres', '127.0.0.1', 'localhost'].includes(url.hostname)
    )
      fail();
    return { database: name, role: url.username };
  } catch {
    fail();
  }
}
