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

const EVERYONE = '{"mode":"everyone","orgIds":[]}';

/** Brian's review flags (docs/plans/2026-10-11-lesson-planner-brian-review.md). */
const LESSON_PLANNER_REVIEW_FLAG_SETTINGS = [
  'feature_flag.lesson_planner_intake_v2',
  'feature_flag.lesson_planner_stack_v2',
  'feature_flag.lesson_planner_deck_v2',
  // Brian's run 2 (docs/plans/2026-10-12-lesson-planner-brian-run-2.md).
  'feature_flag.lesson_planner_stack_panel',
  'feature_flag.lesson_planner_plan_export_v2',
  // Brian's run 3 (docs/plans/2026-10-19-lesson-planner-brian-run-3.md).
  'feature_flag.lesson_planner_stack_v3',
  'feature_flag.lesson_planner_share',
  'feature_flag.lesson_planner_run_show',
  'feature_flag.lesson_planner_templates',
  // The Lesson Deck Kit (gallery deck).
  'feature_flag.lesson_planner_deck_gallery',
  // The teacher's own documents (docs/plans/2026-10-21-sharing-standards-uploads.md).
  'feature_flag.lesson_planner_uploads',
  // Brian's handoff (docs/plans/2026-10-24-stack-v2-and-library-redesign.md).
  'feature_flag.lesson_planner_teach_notes',
  'feature_flag.lesson_planner_library_v2',
] as const;

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
  for (const name of LESSON_PLANNER_REVIEW_FLAG_SETTINGS) {
    await prisma.setting.upsert({
      where: { name },
      create: {
        name,
        value: EVERYONE,
        valueType: 'json',
        description: 'Started on for PR preview',
      },
      update: {},
    });
  }
  console.log('Lesson Planner feature flags: enabled for PR preview');
  return { enabled: true as const };
}
