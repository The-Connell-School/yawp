/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { isDemoPlannerQaEnvironment } from '../seed-preview-planner-qa';
import { shouldRunFreeTierShipReviewSeed } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

const FREE_TIER_FLAG_SETTING = 'feature_flag.free_tier';

async function upsertFreeTierEveryone(prisma: PrismaClient) {
  await prisma.setting.upsert({
    where: { name: FREE_TIER_FLAG_SETTING },
    create: {
      name: FREE_TIER_FLAG_SETTING,
      value: 'true',
      valueType: 'boolean',
      description: 'Enabled for preview/demo QA',
    },
    update: { value: 'true', updatedAt: new Date() },
  });
}

/** PR previews (`yawp_pr_<n>`) turn Free Tier C on so ship-review and QA work. */
export async function ensureFreeTierEnabledForPreview(
  prisma: PrismaClient,
  databaseName: string
) {
  if (!shouldRunFreeTierShipReviewSeed(databaseName)) {
    return { skipped: true as const };
  }
  await upsertFreeTierEveryone(prisma);
  console.log('Free tier feature flag: enabled for PR preview');
  return { enabled: true as const };
}

/** Demo keeps Free Tier on while production stays off until yawp-internal toggles it. */
export async function ensureFreeTierEnabledForDemo(prisma: PrismaClient) {
  if (!isDemoPlannerQaEnvironment()) return { skipped: true as const };
  await upsertFreeTierEveryone(prisma);
  console.log('Free tier feature flag: enabled for demo');
  return { enabled: true as const };
}
