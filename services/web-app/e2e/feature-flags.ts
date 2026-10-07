import { createE2EPrismaClient } from './prisma-client';

// Mirrors featureFlagSettingName(DAILY_PAGES_WRITING_CONDITIONS_FLAG) in
// app/domain/feature-flags/feature-flags.ts. The flag is global and starts
// off; specs that exercise paragraph type or writing time turn it on for
// themselves and back off afterwards. Playwright runs with one worker, so a
// spec's setting cannot leak into another running at the same time.
const WRITING_CONDITIONS_SETTING =
  'feature_flag.daily_pages_paragraph_type_and_writing_time';

export async function setWritingConditionsFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setting.upsert({
      where: { name: WRITING_CONDITIONS_SETTING },
      create: {
        name: WRITING_CONDITIONS_SETTING,
        value: enabled ? 'true' : 'false',
        valueType: 'boolean',
        description: 'Set by e2e',
      },
      update: { value: enabled ? 'true' : 'false', updatedAt: new Date() },
    });
  } finally {
    await prisma.$disconnect();
  }
}
