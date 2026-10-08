/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { isDemoPlannerQaEnvironment } from '../seed-preview-planner-qa';

const LESSON_PLANNER_FLAG_SETTING = 'feature_flag.lesson_planner';

/** Demo keeps Lesson Planner on while production stays off until yawp-internal toggles it. */
export async function ensureLessonPlannerEnabledForDemo(prisma: PrismaClient) {
  if (!isDemoPlannerQaEnvironment()) return { skipped: true as const };

  await prisma.setting.upsert({
    where: { name: LESSON_PLANNER_FLAG_SETTING },
    create: {
      name: LESSON_PLANNER_FLAG_SETTING,
      value: 'true',
      valueType: 'boolean',
      description: 'Enabled for demo.yawp.school',
    },
    update: { value: 'true', updatedAt: new Date() },
  });
  console.log('Lesson Planner feature flag: enabled for demo');
  return { enabled: true as const };
}
