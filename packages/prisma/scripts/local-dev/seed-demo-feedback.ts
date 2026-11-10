import type { PrismaClient } from '../../generated/prisma';

/** Demo feedback is deployment-gated; seeding no longer writes a product flag row. */
export async function ensureDemoFeedbackEnabled(
  _prisma: Pick<PrismaClient, 'setting'>,
  env: NodeJS.ProcessEnv = process.env
) {
  const slug = env.PREVIEW_SLUG?.trim().toLowerCase();
  const environment = env.YAWP_ENVIRONMENT?.trim().toLowerCase();
  if (slug === 'demo' || environment === 'demo') {
    return { enabled: true as const };
  }
  return { skipped: true as const };
}
