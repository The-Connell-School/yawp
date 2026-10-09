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

const INTERNAL_RUBRICS_FLAG_SETTING = 'feature_flag.internal_rubrics';

/**
 * Demo starts "Rubrics from Yawp Internal" on for everyone; production and
 * previews stay off until yawp-internal turns it on. Create-only, so a later
 * change made from yawp-internal is never overwritten by a reseed.
 */
export async function ensureInternalRubricsEnabledForDemo(
  prisma: Pick<PrismaClient, 'setting'>,
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isDemoPlannerQaEnvironment(env)) return { skipped: true as const };

  await prisma.setting.upsert({
    where: { name: INTERNAL_RUBRICS_FLAG_SETTING },
    create: {
      name: INTERNAL_RUBRICS_FLAG_SETTING,
      value: JSON.stringify({ mode: 'everyone', orgIds: [] }),
      valueType: 'json',
      description: 'Started on for everyone on demo.yawp.school',
    },
    update: {},
  });
  console.log('Rubrics from Yawp Internal feature flag: on for everyone on demo (unless already set)');
  return { enabled: true as const };
}
