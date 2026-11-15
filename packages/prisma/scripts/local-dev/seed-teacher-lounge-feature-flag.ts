/* eslint-disable no-console */
import type { PrismaClient } from '../../generated/prisma';
import { shouldRunFreeTierShipReviewSeed as isPrPreviewDatabase } from '../../../../scripts/preview/free-tier-ship-review-seed-guard.mjs';

const TEACHER_LOUNGE_FLAG_SETTING = 'feature_flag.teacher-lounge';
const ON_FOR_EVERYONE = JSON.stringify({ mode: 'everyone', orgIds: [] });
const PREVIEW_DESCRIPTION = 'Started on for everyone in this PR preview';

/**
 * The row migration 20261104120000_admin_config_access_lists inserts in every
 * database. Changing the flag from Admin or Yawp Internal rewrites the
 * description, so a row that still matches this has not been touched by anyone.
 */
export const TEACHER_LOUNGE_MIGRATION_SEED = {
  value: '{"mode":"off","orgIds":[]}',
  description: "Teacher's Lounge rollout (off = hidden except access-list bypass)",
} as const;

/**
 * PR previews (`yawp_pr_<n>`) start the Teacher's Lounge on for everyone so
 * reviewers see its nav item and `/app/teacher-trainings`. Only the untouched
 * migration row is switched on: a flag someone set in that preview sticks
 * across reseeds. Demo and production keep whatever Yawp Internal set.
 */
export async function ensureTeacherLoungeEnabledForPreview(
  prisma: Pick<PrismaClient, 'setting'>,
  databaseName: string
) {
  if (!isPrPreviewDatabase(databaseName)) return { skipped: true as const };
  await prisma.setting.updateMany({
    where: { name: TEACHER_LOUNGE_FLAG_SETTING, ...TEACHER_LOUNGE_MIGRATION_SEED },
    data: { value: ON_FOR_EVERYONE, description: PREVIEW_DESCRIPTION },
  });
  await prisma.setting.upsert({
    where: { name: TEACHER_LOUNGE_FLAG_SETTING },
    create: {
      name: TEACHER_LOUNGE_FLAG_SETTING,
      value: ON_FOR_EVERYONE,
      valueType: 'json',
      description: PREVIEW_DESCRIPTION,
    },
    update: {},
  });
  console.log("Teacher's Lounge feature flag: on for this PR preview (unless already changed)");
  return { enabled: true as const };
}
