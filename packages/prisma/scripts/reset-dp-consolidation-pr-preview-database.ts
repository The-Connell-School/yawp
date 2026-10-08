/* eslint-disable no-console */
/**
 * One-time cleanup for PR preview DBs polluted by early DP consolidation QA seeds
 * (fake revisions on the real daily-pages-engagement name, wrong Class Starter rubric).
 *
 * Runs only when current_database() is exactly yawp_pr_412.
 */
import { createPrismaClient } from './local-dev/connection';
import {
  DP_QA_PINNED_LEGACY_RUBRIC_NAME,
  DP_PREVIEW_QA_DATABASE_PATTERN,
  resolveCurrentDatabaseName,
} from './apply-daily-pages-engagement-v2-seed';

const TARGET_DATABASE = 'yawp_pr_412';
const ENGAGEMENT_RUBRIC_ID = 'cmsvqo8lf002801l60o74x8wr';
const CLASS_STARTER_KIND = 'class_starter';

export async function resetDpConsolidationPrPreviewDatabase(
  prisma: ReturnType<typeof createPrismaClient>
) {
  const database = await resolveCurrentDatabaseName(prisma);
  if (database !== TARGET_DATABASE) {
    console.log(
      JSON.stringify({
        skipped: true,
        reason: 'database-not-target',
        database,
        target: TARGET_DATABASE,
      })
    );
    return { skipped: true, reason: 'database-not-target' as const };
  }

  if (!DP_PREVIEW_QA_DATABASE_PATTERN.test(database)) {
    console.warn('reset-dp-consolidation: unexpected database name shape', database);
    return { skipped: true, reason: 'database-pattern-mismatch' as const };
  }

  await prisma.rubricRevision.deleteMany({
    where: {
      OR: [
        { reason: 'DP QA pinned legacy preview fixture' },
        {
          rubricName: 'daily-pages-engagement',
          version: { gte: 98_000 },
        },
      ],
    },
  });

  const qaAssignments = await prisma.assignment.findMany({
    where: { title: { startsWith: 'DP QA ' } },
    select: { id: true },
  });
  const qaAssignmentIds = qaAssignments.map((row) => row.id);
  if (qaAssignmentIds.length) {
    const qaDocumentIds = (
      await prisma.document.findMany({
        where: { assignmentId: { in: qaAssignmentIds } },
        select: { id: true },
      })
    ).map((row) => row.id);
    if (qaDocumentIds.length) {
      await prisma.submission.deleteMany({
        where: { documentId: { in: qaDocumentIds } },
      });
    }
    await prisma.document.deleteMany({
      where: { assignmentId: { in: qaAssignmentIds } },
    });
    await prisma.classAssignment.deleteMany({
      where: { assignmentId: { in: qaAssignmentIds } },
    });
    await prisma.assignment.deleteMany({
      where: { id: { in: qaAssignmentIds } },
    });
  }

  const classStarterType = await prisma.assignmentType.findFirst({
    where: { kind: CLASS_STARTER_KIND, archivedAt: null },
    select: { id: true, rubricId: true },
  });
  if (classStarterType?.rubricId === ENGAGEMENT_RUBRIC_ID) {
    const classStarterRubric = await prisma.rubric.findFirst({
      where: {
        name: { in: ['class-starter-engagement', 'Class Starter engagement'] },
        archivedAt: null,
      },
      select: { id: true },
    });
    if (classStarterRubric) {
      await prisma.assignmentType.update({
        where: { id: classStarterType.id },
        data: { rubricId: classStarterRubric.id },
      });
    } else {
      await prisma.assignmentType.update({
        where: { id: classStarterType.id },
        data: { rubricId: null },
      });
    }
  }

  await prisma.rubric.update({
    where: { id: ENGAGEMENT_RUBRIC_ID },
    data: { currentRevisionId: null },
  });

  console.log(
    JSON.stringify({
      reset: true,
      database,
      removedQaAssignments: qaAssignmentIds.length,
    })
  );
  return { reset: true, database };
}

if (import.meta.main) {
  const prisma = createPrismaClient();
  try {
    const result = await resetDpConsolidationPrPreviewDatabase(prisma);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
