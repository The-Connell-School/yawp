/* eslint-disable no-console */
/**
 * Idempotent post-seed step for local dev and PR previews.
 *
 * Prisma migrate deploy runs before seed-local-dev on a fresh database, so the
 * engagement migration's data block often no-ops (library row not inserted yet).
 * This script applies the same outcome by name/id once fixtures exist.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '../generated/prisma';
import { createPrismaClient } from './local-dev/connection';
import { LOCAL_DEV_ORG_ID } from './local-dev/dev-personas';
import engagementLibrary from '../../../services/web-app/app/domain/rubrics/library/daily-pages-engagement.json';

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

export type ApplyDailyPagesEngagementV2SeedOptions = {
  /** Preview QA rows for screenshot capture; off by default on shared previews. */
  includePreviewQaFixtures?: boolean;
};

export async function applyDailyPagesEngagementV2Seed(
  prisma: ReturnType<typeof createPrismaClient>,
  options: ApplyDailyPagesEngagementV2SeedOptions = {}
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

  if (options.includePreviewQaFixtures) {
    await seedDpConsolidationQaPreviewFixtures(prisma, engagement.id);
  }

  return { applied: true, engagementRubricId: engagement.id };
}

/** Preview-only rows for the seven QA screenshots (idempotent). */
export async function seedDpConsolidationQaPreviewFixtures(
  prisma: ReturnType<typeof createPrismaClient>,
  engagementRubricId: string
) {
  const teacher = await prisma.orgMembership.findFirst({
    where: {
      user: { email: 'dev.teacher@yawp.local' },
      role: 'TEACHER',
      organizationId: LOCAL_DEV_ORG_ID,
    },
    select: { id: true, organizationId: true },
  });
  const classWithStudent = await prisma.class.findFirst({
    where: {
      isArchived: false,
      teachers: {
        some: {
          user: { email: 'dev.teacher@yawp.local' },
          organizationId: LOCAL_DEV_ORG_ID,
        },
      },
      students: { some: { user: { email: 'dev.student@yawp.local' } } },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      title: true,
      students: {
        where: { user: { email: 'dev.student@yawp.local' } },
        take: 1,
        select: { id: true },
      },
    },
  });
  const klass = classWithStudent ? { id: classWithStudent.id } : null;
  const student = classWithStudent?.students[0] ?? null;
  const dailyPagesType = await prisma.assignmentType.findFirst({
    where: { kind: 'daily_pages', archivedAt: null },
    orderBy: { position: 'asc' },
    select: { id: true },
  });
  if (!teacher || !student || !klass || !dailyPagesType) {
    console.warn(
      'DP QA preview fixtures skipped:',
      JSON.stringify({
        teacher: Boolean(teacher),
        student: Boolean(student),
        klass: Boolean(klass),
        dailyPagesType: Boolean(dailyPagesType),
      })
    );
    return;
  }

  async function ensureClassAssignment(assignmentId: string) {
    await prisma.classAssignment.upsert({
      where: {
        assignmentId_classId: { assignmentId, classId: klass!.id },
      },
      create: { assignmentId, classId: klass!.id },
      update: {},
    });
  }

  const legacySchema = {
    name: 'daily-pages-engagement',
    title: 'Daily Pages engagement',
    scoringScale: {
      type: 'rubric_points',
      minScore: 0,
      maxScore: 30,
      step: 10,
      compositeMin: 0,
      compositeMax: 30,
    },
    rubric: {
      categories: [
        {
          key: 'engagement_with_prompt',
          label: 'Engagement with Prompt',
          weight: 1,
          scoreLabels: [
            { value: 0, label: 'Not Present' },
            { value: 10, label: 'Needs More' },
            { value: 20, label: 'Good' },
            { value: 30, label: 'Excellent' },
          ],
        },
      ],
    },
    outputSchema: { responseShape: 'categories_overall_comment', schemaVersion: 1 },
  };

  let legacyRevision = await prisma.rubricRevision.findFirst({
    where: { reason: 'DP QA pinned legacy preview fixture' },
    select: { id: true },
  });
  if (!legacyRevision) {
    legacyRevision = await prisma.rubricRevision.create({
      data: {
        id: randomUUID(),
        rubricName: 'daily-pages-engagement',
        version: 98_001,
        schemaJson: legacySchema,
        fingerprint: `dp-qa-legacy-${Date.now()}`,
        requestId: randomUUID(),
        requestHash: `dp-qa-legacy-${Date.now()}`,
        createdBy: 'dp-qa-preview-seed',
        reason: 'DP QA pinned legacy preview fixture',
      },
      select: { id: true },
    });
  }

  const pinnedTitle = 'DP QA Pinned Legacy (Preview)';
  let pinnedAssignment = await prisma.assignment.findFirst({
    where: { title: pinnedTitle, assignmentTypeId: dailyPagesType.id },
    select: { id: true },
  });
  if (!pinnedAssignment) {
    pinnedAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: dailyPagesType.id,
        title: pinnedTitle,
        prompt: 'Describe a place that matters to you.',
        pointValue: 30,
        rubricRevisionId: legacyRevision.id,
        submitForGrade: true,
      },
      select: { id: true },
    });
    await ensureClassAssignment(pinnedAssignment.id);
  } else {
    await ensureClassAssignment(pinnedAssignment.id);
    await prisma.assignment.update({
      where: { id: pinnedAssignment.id },
      data: {
        rubricRevisionId: legacyRevision.id,
        pointValue: 30,
      },
    });
  }

  const pinnedDocTitle = 'DP QA pinned legacy submission';
  const existingPinnedDoc = await prisma.document.findFirst({
    where: { title: pinnedDocTitle, assignmentId: pinnedAssignment.id },
    select: { id: true },
  });
  if (!existingPinnedDoc) {
    const classAssignment = await prisma.classAssignment.findFirstOrThrow({
      where: { assignmentId: pinnedAssignment.id, classId: klass.id },
      select: { id: true },
    });
    const submissionId = randomUUID();
    const text =
      'Pinned legacy QA entry. I wrote about the kitchen table where we ate breakfast.';
    await prisma.document.create({
      data: {
        id: submissionId,
        title: pinnedDocTitle,
        text,
        html: `<p>${text}</p>`,
        membershipId: student.id,
        assignmentTypeId: dailyPagesType.id,
        assignmentId: pinnedAssignment.id,
        classAssignmentId: classAssignment.id,
      },
    });
    await prisma.submission.create({
      data: {
        id: submissionId,
        documentId: submissionId,
        html: `<p>${text}</p>`,
        text,
        title: pinnedDocTitle,
        submittedAt: new Date(),
        gradedAt: new Date(),
        gradedByMembershipId: teacher.id,
        overallScore: 20,
        score: '20/30',
        overallComment: 'Legacy tier labels preserved on pinned revision.',
        rubricScores: {
          engagement_with_prompt: { score: 20, comment: '', isAi: true },
        },
      },
    });
  }

  const swapTitle = 'DP QA Swap Persistence (Preview)';
  let swapAssignment = await prisma.assignment.findFirst({
    where: { title: swapTitle, assignmentTypeId: dailyPagesType.id },
    select: { id: true },
  });
  if (!swapAssignment) {
    swapAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: dailyPagesType.id,
        title: swapTitle,
        prompt: 'Write about a habit you are trying to build.',
        pointValue: 12,
        submitForGrade: true,
      },
      select: { id: true },
    });
    await ensureClassAssignment(swapAssignment.id);
    const classAssignment = await prisma.classAssignment.findFirstOrThrow({
      where: { assignmentId: swapAssignment.id, classId: klass.id },
      select: { id: true },
    });
    const text =
      'I kept writing even when I did not know where it was going.';
    const document = await prisma.document.create({
      data: {
        title: 'DP QA swap persistence doc',
        text,
        html: `<p>${text}</p>`,
        membershipId: student.id,
        assignmentTypeId: dailyPagesType.id,
        assignmentId: swapAssignment.id,
        classAssignmentId: classAssignment.id,
      },
    });
    await prisma.submission.create({
      data: {
        documentId: document.id,
        html: document.html!,
        text: document.text!,
        title: document.title,
        submittedAt: new Date(),
        score: '10/12',
        overallScore: 10,
      },
    });
  } else {
    await ensureClassAssignment(swapAssignment.id);
  }

  const notesTitle = 'DP QA Teacher Notes (Preview)';
  let notesAssignment = await prisma.assignment.findFirst({
    where: { title: notesTitle, assignmentTypeId: dailyPagesType.id },
    select: { id: true },
  });
  if (!notesAssignment) {
    notesAssignment = await prisma.assignment.create({
      data: {
        assignmentTypeId: dailyPagesType.id,
        title: notesTitle,
        prompt: 'What did you notice on the way to class today?',
        pointValue: 12,
        submitForGrade: true,
      },
      select: { id: true },
    });
    await ensureClassAssignment(notesAssignment.id);
    const classAssignment = await prisma.classAssignment.findFirstOrThrow({
      where: { assignmentId: notesAssignment.id, classId: klass.id },
      select: { id: true },
    });
    const submissionId = randomUUID();
    const text = 'The air smelled like rain even though the sky was clear.';
    await prisma.document.create({
      data: {
        id: submissionId,
        title: 'DP QA teacher notes doc',
        text,
        html: `<p>${text}</p>`,
        membershipId: student.id,
        assignmentTypeId: dailyPagesType.id,
        assignmentId: notesAssignment.id,
        classAssignmentId: classAssignment.id,
      },
    });
    const teacherNote =
      'Student mentioned sensory detail — worth praising in conference.';
    await prisma.submission.create({
      data: {
        id: submissionId,
        documentId: submissionId,
        html: `<p>${text}</p>`,
        text,
        title: 'DP QA teacher notes submission',
        submittedAt: new Date(),
        gradedAt: new Date(),
        gradedByMembershipId: teacher.id,
        overallScore: 10,
        score: '10/12',
        overallComment: 'You stayed with the observation.',
        rubricScores: {
          engagement_with_prompt: { score: 10, comment: '', isAi: true },
        },
      },
    });
    await prisma.submissionGradingAssistantRun.create({
      data: {
        submissionId,
        source: 'assignment-type',
        status: 'succeeded',
        assignmentTypeRubricSnapshot: {
          categories: (engagementLibrary as { rubric: { categories: unknown } })
            .rubric.categories,
          minScore: 0,
          maxScore: 12,
          step: 1,
          scoringType: 'rubric_points',
        },
        metadata: {
          teacherNote,
          output: {
            rubricScores: { engagement_with_prompt: { score: 10 } },
            overallComment: 'You stayed with the observation.',
            score: '10/12',
          },
        },
      },
    });
  } else {
    await ensureClassAssignment(notesAssignment.id);
  }

  const classStarterType = await prisma.assignmentType.findFirst({
    where: { kind: 'class_starter', archivedAt: null },
    select: { id: true },
  });
  const csTitle = 'DP QA Class Starter Grading (Preview)';
  if (classStarterType) {
    let csAssignment = await prisma.assignment.findFirst({
      where: { title: csTitle, assignmentTypeId: classStarterType.id },
      select: { id: true },
    });
    if (!csAssignment) {
      csAssignment = await prisma.assignment.create({
        data: {
          assignmentTypeId: classStarterType.id,
          title: csTitle,
          prompt: 'Write freely for ten minutes about something you noticed today.',
          pointValue: 5,
          submitForGrade: true,
        },
        select: { id: true },
      });
      await ensureClassAssignment(csAssignment.id);
      const classAssignment = await prisma.classAssignment.findFirstOrThrow({
        where: { assignmentId: csAssignment.id, classId: klass.id },
        select: { id: true },
      });
      const submissionId = randomUUID();
      const text =
        'Class Starter QA entry. I kept writing past the point where I wanted to stop.';
      await prisma.document.create({
        data: {
          id: submissionId,
          title: 'DP QA class starter doc',
          text,
          html: `<p>${text}</p>`,
          membershipId: student.id,
          assignmentTypeId: classStarterType.id,
          assignmentId: csAssignment.id,
          classAssignmentId: classAssignment.id,
        },
      });
      await prisma.submission.create({
        data: {
          id: submissionId,
          documentId: submissionId,
          html: `<p>${text}</p>`,
          text,
          title: 'DP QA class starter submission',
          submittedAt: new Date(),
        },
      });
    } else {
      await ensureClassAssignment(csAssignment.id);
    }
  }

  await prisma.assignmentType.update({
    where: { id: dailyPagesType.id },
    data: { rubricId: engagementRubricId },
  });

  console.log(
    'DP QA preview fixtures ready:',
    JSON.stringify({
      classId: klass.id,
      classTitle: classWithStudent?.title,
      dailyPagesTypeId: dailyPagesType.id,
    })
  );
}

if (import.meta.main) {
  const prisma = createPrismaClient();
  const includePreviewQaFixtures =
    process.env.YAWP_INCLUDE_DP_PREVIEW_QA === '1' ||
    process.env.LOCAL_DEV_INCLUDE_DP_QA_FIXTURES === 'true';
  try {
    const result = await applyDailyPagesEngagementV2Seed(prisma, {
      includePreviewQaFixtures,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}
