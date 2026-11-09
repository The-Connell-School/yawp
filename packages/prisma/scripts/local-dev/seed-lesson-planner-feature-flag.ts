/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { isDemoPlannerQaEnvironment } from '../seed-preview-planner-qa';
import { shouldRunFreeTierShipReviewSeed } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

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

const EVERYONE = '{"mode":"everyone","orgIds":[]}';

/** Legacy review-flag rows; runtime ignores them (master `lesson_planner` only). */
export const LESSON_PLANNER_REVIEW_FLAG_SETTINGS = [] as const;

/** No-op: internal rubrics are always on; legacy Setting rows are harmless. */
export async function ensureInternalRubricsEnabledForDemo(
  _prisma: Pick<PrismaClient, 'setting'>,
  _env: NodeJS.ProcessEnv = process.env
) {
  return { skipped: true as const };
}

/**
 * PR previews (`yawp_pr_<n>` only) show the Lesson Planner, so a reviewer can
 * see planner work in any seat, the free classroom included. The planner is
 * forced on like the free-tier flag; the review flags are create-only, so a
 * tester who switches one off to compare is not overridden by a redeploy.
 * Never runs against the demo, production, or any shared database.
 */
export async function ensureLessonPlannerEnabledForPreview(
  prisma: Pick<PrismaClient, 'setting'>,
  databaseName: string
) {
  if (!shouldRunFreeTierShipReviewSeed(databaseName)) {
    return { skipped: true as const };
  }
  await prisma.setting.upsert({
    where: { name: LESSON_PLANNER_FLAG_SETTING },
    create: {
      name: LESSON_PLANNER_FLAG_SETTING,
      value: EVERYONE,
      valueType: 'json',
      description: 'Enabled for PR preview',
    },
    update: { value: EVERYONE, valueType: 'json', updatedAt: new Date() },
  });
  console.log('Lesson Planner feature flag: enabled for PR preview');
  return { enabled: true as const };
}
