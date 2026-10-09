import { prisma } from '~/utils/db.server';
import { featureFlagSettingName, FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';

/** Turn Free Tier C on for FREE_TIER_DB_TESTS integration suites. */
export async function enableFreeTierFlagForIntegrationTests() {
  const name = featureFlagSettingName(FREE_TIER_FLAG);
  await prisma.setting.upsert({
    where: { name },
    create: {
      name,
      value: 'true',
      valueType: 'boolean',
      description: 'Enabled for FREE_TIER_DB_TESTS',
    },
    update: { value: 'true', updatedAt: new Date() },
  });
}
