/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { shouldRunFreeTierShipReviewSeed } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

const THESIS_ESSAY_DECKS_FLAG_SETTING = 'feature_flag.thesis_essay_decks';

/**
 * PR previews (`yawp_pr_<n>`) start the Thesis-Driven Essay decks flag on, so
 * the one-click preview shows the decks in the Modules. Create-only: turning
 * it off in a preview sticks across redeploys. Demo, production and local
 * databases are left alone (off until yawp-internal turns it on).
 */
export async function ensureThesisEssayDecksEnabledForPreview(
  prisma: Pick<PrismaClient, 'setting'>,
  databaseName: string
) {
  if (!shouldRunFreeTierShipReviewSeed(databaseName)) return { skipped: true as const };

  await prisma.setting.upsert({
    where: { name: THESIS_ESSAY_DECKS_FLAG_SETTING },
    create: {
      name: THESIS_ESSAY_DECKS_FLAG_SETTING,
      value: 'true',
      valueType: 'boolean',
      description: 'Started on for PR preview QA',
    },
    update: {},
  });
  console.log('Thesis-Driven Essay decks feature flag: on for PR preview (unless already set)');
  return { enabled: true as const };
}
