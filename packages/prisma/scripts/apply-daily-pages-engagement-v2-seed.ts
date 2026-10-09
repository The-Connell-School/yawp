/* eslint-disable no-console */
/**
 * Idempotent post-seed step for local dev and PR previews.
 *
 * Prisma migrate deploy runs before seed-local-dev on a fresh database, so the
 * engagement migration's data block often no-ops (library row not inserted yet).
 * This script applies the same outcome by name/id once fixtures exist.
 */
import type { Prisma } from '../generated/prisma';
import { createPrismaClient } from './local-dev/connection';
import engagementLibrary from '../../../services/web-app/app/domain/rubrics/library/daily-pages-engagement.json';

const CLASS_STARTER_RUBRIC_NAME = 'class-starter-engagement';
const CLASS_STARTER_KIND = 'class_starter';

const ENGAGEMENT_RUBRIC_ID = 'cmsvqo8lf002801l60o74x8wr';
const DAILY_PAGES_TYPE_ID = 'cmlgtyo8j01em0qjs6knw7cni';
const SJP_DAILY_PAGES_TYPE_ID = 'cmtk7cy2r017y01l8r5ix4kxf';
const SHORT_FORM_RUBRIC_ID = 'cmumlbxru000001jn1cjqkham';
const REFLECTION_RUBRIC_ID = 'cmtuonqfw000101l3ntnz78sj';
const ARCHIVED_RUBRIC_NAMES = ['daily-pages-short-form', 'daily-pages-reflection'];

const DP_ENGAGEMENT_MIGRATION_NAME =
  '20261008121500_daily_pages_engagement_rubric_consolidation';

async function isDpEngagementMigrationApplied(
  prisma: ReturnType<typeof createPrismaClient>
): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ applied: number }[]>`
    SELECT 1 AS applied
    FROM "_prisma_migrations"
    WHERE migration_name = ${DP_ENGAGEMENT_MIGRATION_NAME}
      AND finished_at IS NOT NULL
      AND rolled_back_at IS NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

/** Matches migration SQL: library JSON plus preserved teacherNotesEnabled when set. */
export function buildDailyPagesEngagementV2SchemaJson(
  currentSchema: Record<string, unknown> | null | undefined
): Prisma.InputJsonValue {
  const v2 = JSON.parse(JSON.stringify(engagementLibrary)) as Record<
    string,
    unknown
  >;
  const currentOutput = currentSchema?.outputSchema as
    | Record<string, unknown>
    | undefined;
  const output = v2.outputSchema as Record<string, unknown>;
  if (
    currentOutput &&
    typeof currentOutput === 'object' &&
    Object.prototype.hasOwnProperty.call(currentOutput, 'teacherNotesEnabled')
  ) {
    output.teacherNotesEnabled = currentOutput.teacherNotesEnabled;
  }
  return v2 as Prisma.InputJsonValue;
}

async function relinkClassStarterToEngagementRubric(
  prisma: ReturnType<typeof createPrismaClient>,
  dailyPagesEngagementRubricId: string
) {
  const classStarterType = await prisma.assignmentType.findFirst({
    where: { kind: CLASS_STARTER_KIND, archivedAt: null },
    select: { id: true, rubricId: true },
  });
  if (!classStarterType) return;

  const classStarterRubric = await prisma.rubric.findFirst({
    where: { name: CLASS_STARTER_RUBRIC_NAME, archivedAt: null },
    select: { id: true },
  });
  if (!classStarterRubric) {
    console.warn(
      'apply-daily-pages-engagement-v2: class-starter-engagement rubric missing; skipping Class Starter relink.'
    );
    return;
  }

  if (classStarterType.rubricId === dailyPagesEngagementRubricId) {
    await prisma.assignmentType.update({
      where: { id: classStarterType.id },
      data: { rubricId: classStarterRubric.id },
    });
    console.log('Relinked Class Starter assignment type to class-starter-engagement.');
  } else if (classStarterType.rubricId !== classStarterRubric.id) {
    await prisma.assignmentType.update({
      where: { id: classStarterType.id },
      data: { rubricId: classStarterRubric.id },
    });
    console.log('Set Class Starter assignment type rubric to class-starter-engagement.');
  }
}

export async function applyDailyPagesEngagementV2Seed(
  prisma: ReturnType<typeof createPrismaClient>
) {
  if (!(await isDpEngagementMigrationApplied(prisma))) {
    console.warn(
      'apply-daily-pages-engagement-v2: migration not applied; skipping.'
    );
    return { applied: false, reason: 'migration-not-applied' };
  }

  const engagement =
    (await prisma.rubric.findUnique({ where: { id: ENGAGEMENT_RUBRIC_ID } })) ??
    (await prisma.rubric.findUnique({
      where: { name: 'daily-pages-engagement' },
    }));

  if (!engagement) {
    console.warn(
      'apply-daily-pages-engagement-v2: library rubric missing; skipping.'
    );
    return { applied: false, reason: 'missing-library-rubric' };
  }

  const current = engagement.schemaJson as Record<string, unknown> | null;
  const currentScaling =
    current &&
    typeof current === 'object' &&
    typeof (current.outputSchema as Record<string, unknown> | undefined)
      ?.assignmentPointScaling === 'string'
      ? (current.outputSchema as Record<string, unknown>).assignmentPointScaling
      : null;

  if (currentScaling !== 'daily_pages_engagement_v2') {
    await prisma.rubric.update({
      where: { id: engagement.id },
      data: {
        schemaJson: buildDailyPagesEngagementV2SchemaJson(current),
        title: engagementLibrary.title,
      },
    });
    console.log('Updated daily-pages-engagement library schema to v2.');
  }

  await prisma.rubric.updateMany({
    where: {
      OR: [
        { id: { in: [SHORT_FORM_RUBRIC_ID, REFLECTION_RUBRIC_ID] } },
        { name: { in: ARCHIVED_RUBRIC_NAMES } },
      ],
      archivedAt: null,
    },
    data: { archivedAt: new Date() },
  });

  const dailyPagesTypes = await prisma.assignmentType.findMany({
    where: {
      OR: [
        { id: DAILY_PAGES_TYPE_ID },
        { id: SJP_DAILY_PAGES_TYPE_ID },
        { kind: 'daily_pages', rubricId: null },
      ],
    },
    select: { id: true, kind: true, rubricId: true },
  });

  for (const row of dailyPagesTypes) {
    if (row.rubricId) continue;
    await prisma.assignmentType.update({
      where: { id: row.id },
      data: { rubricId: engagement.id },
    });
  }

  await relinkClassStarterToEngagementRubric(prisma, engagement.id);

  return { applied: true, engagementRubricId: engagement.id };
}

if (import.meta.main) {
  const prisma = createPrismaClient();
  try {
    const result = await applyDailyPagesEngagementV2Seed(prisma);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
