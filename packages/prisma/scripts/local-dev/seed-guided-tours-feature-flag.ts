/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { shouldRunFreeTierShipReviewSeed } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

const GUIDED_TOURS_FLAG_SETTING = 'feature_flag.guided-tours';

/**
 * PR previews (`yawp_pr_<n>` only) start page tours on, so a reviewer who
 * jumps to a free teacher sees them. Everyone, not targeted: each new free
 * teacher gets a new organization. Create-only, so a tester who switches
 * tours off to compare is not overridden by a redeploy. The flag has no
 * runtime override; demo and production stay off until someone turns it on.
 */
export async function ensureGuidedToursEnabledForPreview(
  prisma: Pick<PrismaClient, 'setting'>,
  databaseName: string
) {
  if (!shouldRunFreeTierShipReviewSeed(databaseName)) {
    return { skipped: true as const };
  }
  await prisma.setting.upsert({
    where: { name: GUIDED_TOURS_FLAG_SETTING },
    create: {
      name: GUIDED_TOURS_FLAG_SETTING,
      value: JSON.stringify({ mode: 'everyone', orgIds: [] }),
      valueType: 'json',
      description: 'Started on for PR preview',
    },
    update: {},
  });
  console.log('Page tours feature flag: on for PR preview (unless already set)');
  return { enabled: true as const };
}
