/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { shouldRunFreeTierShipReviewSeed as isPrPreviewDatabase } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

const LOUNGE_COMMUNITY_FLAG_SETTING = 'feature_flag.teacher_lounge_community';

/**
 * PR previews (`yawp_pr_<n>`) start the Teacher's Lounge community on for
 * everyone so reviewers see it. Create-only: turning it off later in that
 * preview sticks across reseeds. Demo and production stay off until Yawp
 * Internal turns the flag on.
 */
export async function ensureLoungeCommunityEnabledForPreview(
  prisma: Pick<PrismaClient, 'setting'>,
  databaseName: string
) {
  if (!isPrPreviewDatabase(databaseName)) return { skipped: true as const };
  await prisma.setting.upsert({
    where: { name: LOUNGE_COMMUNITY_FLAG_SETTING },
    create: {
      name: LOUNGE_COMMUNITY_FLAG_SETTING,
      value: JSON.stringify({ mode: 'everyone', orgIds: [] }),
      valueType: 'json',
      description: 'Started on for everyone in this PR preview',
    },
    update: {},
  });
  console.log("Teacher's Lounge community feature flag: on for this PR preview (unless already set)");
  return { enabled: true as const };
}
