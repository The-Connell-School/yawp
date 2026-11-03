import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SETTING_NAME = 'feature_flag.unified-sign-on';

/** The current preview pipeline uses a dedicated role/database on preview-postgres.
 * Parse the entire URL: matching a substring could accept a shared DB or an
 * alternate host supplied through pg connection query parameters.
 */
export function isYawpPrPreviewDatabase(databaseUrl) {
  if (typeof databaseUrl !== 'string' || databaseUrl !== databaseUrl.trim()) return false;
  try {
    const url = new URL(databaseUrl);
    const match = /^\/yawp_pr_([1-9][0-9]*)$/.exec(url.pathname);
    return Boolean(
      match && url.href === databaseUrl && ['postgresql:', 'postgres:'].includes(url.protocol) &&
      url.hostname === 'preview-postgres' && url.port === '5432' &&
      url.username === `yawp_pr_${match[1]}_app` && /^[A-Za-z0-9_-]+$/.test(url.password) &&
      !url.search && !url.hash
    );
  } catch {
    return false;
  }
}

function createPreviewClient(databaseUrl) {
  // Resolve from the application, not the separately mounted reviewed control
  // plane. Both fast and production toolbox containers have these dependencies.
  const require = createRequire(resolve('packages/prisma/package.json'));
  const { PrismaClient } = require('./generated/prisma');
  const { PrismaPg } = require('@prisma/adapter-pg');
  return new PrismaClient({ adapter: new PrismaPg({
    connectionString: databaseUrl, ssl: false, connectionTimeoutMillis: 15000,
  }) });
}

export async function applyPreviewSignonFlag(env = process.env, createClient = createPreviewClient) {
  if (env.YAWP_ENVIRONMENT !== 'preview') {
    throw new Error('Unified sign-on updater requires the preview environment');
  }
  if (!isYawpPrPreviewDatabase(env.DATABASE_URL)) {
    throw new Error('Unified sign-on updater requires an isolated PR preview database');
  }
  // PR previews default to ON; only an explicit false (opt-out label) turns it off.
  const enabled = env.PREVIEW_UNIFIED_SIGN_ON ?? 'true';
  if (!['true', 'false'].includes(enabled)) {
    throw new Error('PREVIEW_UNIFIED_SIGN_ON must be true or false');
  }
  const mode = enabled === 'true' ? 'everyone' : 'off';
  const value = JSON.stringify({ mode, orgIds: [] });
  const fields = { value, valueType: 'json', description: 'Last changed by preview deployment (default on; opt-out label)' };
  // No client construction, connection or write occurs until every guard passes.
  const prisma = await createClient(env.DATABASE_URL);
  try {
    await prisma.setting.upsert({
      where: { name: SETTING_NAME },
      create: { name: SETTING_NAME, ...fields },
      update: fields,
    });
    return { mode, orgIds: [] };
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const state = await applyPreviewSignonFlag();
    console.log(`Preview unified-sign-on: ${state.mode}`);
  } catch {
    // Adapter errors may contain credentials. Keep deployment logs safe and fail
    // the deploy; the admission wrapper stops the failed preview before handoff.
    console.error('Preview unified-sign-on update failed; rollout stopped. Check environment and isolated database configuration.');
    process.exitCode = 1;
  }
}
