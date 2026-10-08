import { createE2EPrismaClient } from './prisma-client';

// Mirrors featureFlagSettingName(LESSON_PLANNER_FLAG) in
// app/domain/feature-flags/feature-flags.ts. Specs that exercise the planner
// turn it on for themselves and back off afterwards. Playwright runs with one
// worker, so a spec's setting cannot leak into another running at the same time.
const LESSON_PLANNER_SETTING = 'feature_flag.lesson_planner';

export async function setLessonPlannerFlag(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.setting.upsert({
      where: { name: LESSON_PLANNER_SETTING },
      create: {
        name: LESSON_PLANNER_SETTING,
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
