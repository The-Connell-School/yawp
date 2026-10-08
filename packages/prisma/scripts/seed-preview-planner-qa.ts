/* eslint-disable no-console */
/**
 * Preview-only QA fixtures for Lesson Planner ship review. Never run on production
 * or the demo environment. Invoked from preview seat bootstrap on PR previews only.
 */
import type { Prisma, PrismaClient } from '../generated/prisma';
import {
  composeExitTicketPrompt,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  type ExitTicketConfig,
} from '../../../services/web-app/app/domain/assignment-types/exit-ticket';
import { isLocalDatabaseUrl } from './local-dev/database-url';
import {
  PREVIEW_PLANNER_QA_IDS,
  PREVIEW_PLANNER_QA_STUDENT_EMAIL,
  PREVIEW_PLANNER_QA_TEACHER_EMAIL,
} from './preview-planner-qa-ids';

const INSIGHT_SUMMARY = {
  overview: 'The class argues well but lands its essays softly.',
  categories: [
    {
      key: 'organization_and_structure',
      label: 'Organization/Structure',
      status: 'gap',
      summary: 'Conclusions restate the introduction.',
    },
  ],
  nextSteps: [
    {
      title: 'Teach conclusions that answer "so what?"',
      detail: 'Model two conclusions side by side, then revise their own.',
      rubricCategory: 'organization_and_structure',
    },
  ],
};

export function isDemoPlannerQaEnvironment(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const slug = env.PREVIEW_SLUG ?? env.SLUG ?? '';
  const databaseName = env.DATABASE_NAME ?? '';
  const databaseUrl = env.DATABASE_URL ?? '';
  return (
    slug === 'demo' ||
    databaseName === 'yawp_demo' ||
    /\/yawp_demo(\?|$)/i.test(databaseUrl)
  );
}

export function assertPreviewPlannerQaTarget(
  databaseUrl = process.env.DATABASE_URL
) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required');
  }
  if (isDemoPlannerQaEnvironment({ ...process.env, DATABASE_URL: databaseUrl })) {
    throw new Error('preview planner QA seed refused on demo database');
  }
  if (/yawp_production/i.test(databaseUrl)) {
    throw new Error('preview planner QA seed refused on production database');
  }
  const isPreviewDb = /yawp_pr_\d+/i.test(databaseUrl);
  if (!isPreviewDb && !isLocalDatabaseUrl(databaseUrl)) {
    throw new Error('preview planner QA seed only runs on preview or local databases');
  }
  if (process.env.NODE_ENV === 'production' && !isPreviewDb) {
    throw new Error('preview planner QA seed refused in production');
  }
}

export async function seedPreviewPlannerQa(
  prisma: PrismaClient,
  options: { organizationId?: string } = {}
) {
  if (isDemoPlannerQaEnvironment()) {
    console.log('preview planner QA: demo environment; skipping');
    return { skipped: true as const, reason: 'demo' as const };
  }

  const orgScope = options.organizationId
    ? { organizationId: options.organizationId }
    : {};

  const teacher = await prisma.orgMembership.findFirst({
    where: {
      role: 'TEACHER',
      isActive: true,
      ...orgScope,
      user: { email: PREVIEW_PLANNER_QA_TEACHER_EMAIL },
    },
    select: { id: true, organizationId: true },
  });
  if (!teacher) {
    console.log('preview planner QA: dev.teacher not found; skipping');
    return { skipped: true as const, reason: 'missing_dev_teacher' as const };
  }

  const student = await prisma.orgMembership.findFirst({
    where: {
      role: 'STUDENT',
      isActive: true,
      organizationId: teacher.organizationId,
      user: { email: PREVIEW_PLANNER_QA_STUDENT_EMAIL },
    },
    select: { id: true },
  });
  if (!student) {
    console.log('preview planner QA: dev.student not found; skipping');
    return { skipped: true as const, reason: 'missing_dev_student' as const };
  }

  const school = await prisma.school.findFirst({
    where: { organizationId: teacher.organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!school) {
    console.log('preview planner QA: no school for dev.teacher; skipping');
    return { skipped: true as const, reason: 'no_school' as const };
  }

  const klass = await prisma.class.upsert({
    where: { id: PREVIEW_PLANNER_QA_IDS.classId },
    update: {
      title: '[QA] Lesson planner preview class',
      isArchived: false,
      teachers: { connect: [{ id: teacher.id }] },
      students: { connect: [{ id: student.id }] },
    },
    create: {
      id: PREVIEW_PLANNER_QA_IDS.classId,
      code: 'QA-PLANNER-01',
      schoolYear: '2025-2026',
      period: 'QA',
      grade: '10',
      title: '[QA] Lesson planner preview class',
      schoolId: school.id,
      teachers: { connect: [{ id: teacher.id }] },
      students: { connect: [{ id: student.id }] },
    },
    select: { id: true, title: true },
  });

  const insightType =
    (await prisma.assignmentType.findFirst({
      where: {
        kind: {
          in: ['thesis_driven_essay', 'literary_analysis', 'argumentative_essay'],
        },
      },
      orderBy: { position: 'asc' },
      select: { id: true },
    })) ??
    (await prisma.assignmentType.findFirst({
      where: { kind: { not: 'exit_ticket' } },
      orderBy: { position: 'asc' },
      select: { id: true },
    }));
  let insightAssignment: { id: string } | null = null;
  let insightClassAssignment: { id: string } | null = null;
  if (!insightType) {
    console.log('preview planner QA: no essay assignment type for class summary');
  } else {
    const insightAssignmentRow = await prisma.assignment.upsert({
      where: { id: PREVIEW_PLANNER_QA_IDS.insightAssignmentId },
      update: {
        title: '[QA] Class summary insight assignment',
        prompt:
          'Write a short paragraph arguing whether schools should require community service.',
      },
      create: {
        id: PREVIEW_PLANNER_QA_IDS.insightAssignmentId,
        assignmentTypeId: insightType.id,
        title: '[QA] Class summary insight assignment',
        prompt:
          'Write a short paragraph arguing whether schools should require community service.',
        submitForGrade: true,
        pointValue: 100,
      },
      select: { id: true },
    });
    insightAssignment = insightAssignmentRow;

    const insightClassAssignmentRow = await prisma.classAssignment.upsert({
      where: { id: PREVIEW_PLANNER_QA_IDS.insightClassAssignmentId },
      update: {
        classId: klass.id,
        assignmentId: insightAssignmentRow.id,
      },
      create: {
        id: PREVIEW_PLANNER_QA_IDS.insightClassAssignmentId,
        classId: klass.id,
        assignmentId: insightAssignmentRow.id,
      },
      select: { id: true },
    });
    insightClassAssignment = insightClassAssignmentRow;

    await prisma.classAssignmentInsight.upsert({
      where: { classAssignmentId: insightClassAssignmentRow.id },
      create: {
        classAssignmentId: insightClassAssignmentRow.id,
        status: 'ready',
        submissionCount: 8,
        generatedAt: new Date(),
        summaryJson: INSIGHT_SUMMARY as Prisma.InputJsonValue,
        generatedByMembershipId: teacher.id,
      },
      update: {
        status: 'ready',
        submissionCount: 8,
        generatedAt: new Date(),
        summaryJson: INSIGHT_SUMMARY as Prisma.InputJsonValue,
      },
    });
  }

  const exitTicketType = await prisma.assignmentType.findFirst({
    where: { kind: 'exit_ticket' },
    select: { id: true },
  });

  if (!exitTicketType) {
    console.log('preview planner QA: exit ticket type missing; skipping exit fixtures');
    return {
      skipped: false as const,
      classId: klass.id,
      assignmentId: insightAssignment?.id ?? null,
      classAssignmentId: insightClassAssignment?.id ?? null,
    };
  }

  const exitConfig: ExitTicketConfig = {
    schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
    mode: 'specific',
    focus: 'explain-concept',
    topic: 'what a comma splice is and how to fix one',
    answerType: 'objective',
    lessonNotes: {
      mainPoints: 'A comma splice joins two sentences with only a comma.',
      mustMention: 'Whether the material moves.',
      watchFor: 'Calling it a run-on only.',
    },
  };

  const exitAssignment = await prisma.assignment.upsert({
    where: { id: PREVIEW_PLANNER_QA_IDS.exitTicketAssignmentId },
    update: {
      title: '[QA] Exit ticket graded unreleased',
      prompt: composeExitTicketPrompt(exitConfig),
      exitTicketConfigJson: exitConfig as Prisma.InputJsonValue,
      submitForGrade: true,
      pointValue: 10,
    },
    create: {
      id: PREVIEW_PLANNER_QA_IDS.exitTicketAssignmentId,
      assignmentTypeId: exitTicketType.id,
      title: '[QA] Exit ticket graded unreleased',
      prompt: composeExitTicketPrompt(exitConfig),
      exitTicketConfigJson: exitConfig as Prisma.InputJsonValue,
      submitForGrade: true,
      pointValue: 10,
      tutorEnabled: false,
    },
    select: { id: true, title: true },
  });

  await prisma.classAssignment.upsert({
    where: { id: PREVIEW_PLANNER_QA_IDS.exitTicketClassAssignmentId },
    update: {
      classId: klass.id,
      assignmentId: exitAssignment.id,
    },
    create: {
      id: PREVIEW_PLANNER_QA_IDS.exitTicketClassAssignmentId,
      classId: klass.id,
      assignmentId: exitAssignment.id,
    },
  });

  const responseText =
    'A comma splice is when two complete sentences are joined with just a comma. You can fix it with a period, a semicolon, or a comma plus a conjunction.';
  const responseHtml = `<p>${responseText}</p>`;

  await prisma.document.upsert({
    where: { id: PREVIEW_PLANNER_QA_IDS.exitTicketDocumentId },
    update: {
      title: exitAssignment.title ?? '[QA] Exit ticket',
      text: responseText,
      html: responseHtml,
      membershipId: student.id,
      assignmentId: exitAssignment.id,
      classAssignmentId: PREVIEW_PLANNER_QA_IDS.exitTicketClassAssignmentId,
    },
    create: {
      id: PREVIEW_PLANNER_QA_IDS.exitTicketDocumentId,
      assignmentTypeId: exitTicketType.id,
      title: exitAssignment.title ?? '[QA] Exit ticket',
      text: responseText,
      html: responseHtml,
      membershipId: student.id,
      assignmentId: exitAssignment.id,
      classAssignmentId: PREVIEW_PLANNER_QA_IDS.exitTicketClassAssignmentId,
    },
  });

  await prisma.submission.upsert({
    where: { id: PREVIEW_PLANNER_QA_IDS.exitTicketSubmissionId },
    update: {
      documentId: PREVIEW_PLANNER_QA_IDS.exitTicketDocumentId,
      title: exitAssignment.title ?? '[QA] Exit ticket',
      text: responseText,
      html: responseHtml,
      submittedAt: new Date('2026-10-01T15:00:00.000Z'),
      gradedByMembershipId: teacher.id,
      gradedAt: new Date('2026-10-01T16:00:00.000Z'),
      releasedAt: null,
      numericPercentage: 85,
      overallScore: 85,
      letterGrade: 'B',
      score: '85% (B)',
      overallComment:
        'You named the fix clearly; next time tie it to a sentence from your own draft.',
      rubricScores: {
        understanding: { score: 85, comment: '', isAi: true },
      },
    },
    create: {
      id: PREVIEW_PLANNER_QA_IDS.exitTicketSubmissionId,
      documentId: PREVIEW_PLANNER_QA_IDS.exitTicketDocumentId,
      title: exitAssignment.title ?? '[QA] Exit ticket',
      text: responseText,
      html: responseHtml,
      submittedAt: new Date('2026-10-01T15:00:00.000Z'),
      gradedByMembershipId: teacher.id,
      gradedAt: new Date('2026-10-01T16:00:00.000Z'),
      releasedAt: null,
      numericPercentage: 85,
      overallScore: 85,
      letterGrade: 'B',
      score: '85% (B)',
      overallComment:
        'You named the fix clearly; next time tie it to a sentence from your own draft.',
      rubricScores: {
        understanding: { score: 85, comment: '', isAi: true },
      },
    },
  });

  return {
    skipped: false as const,
    classId: klass.id,
    assignmentId: insightAssignment?.id ?? null,
    classAssignmentId: insightClassAssignment?.id ?? null,
    exitTicketSubmissionId: PREVIEW_PLANNER_QA_IDS.exitTicketSubmissionId,
  };
}

if (import.meta.main) {
  try {
    assertPreviewPlannerQaTarget();
  } catch (error) {
    console.log(
      'preview planner QA seed skipped:',
      error instanceof Error ? error.message : error
    );
    process.exit(0);
  }
  // Loaded here, not at the top: the app imports this module, and the
  // generated client must stay out of its bundle.
  const { createPrismaClient } = await import('./local-dev/connection');
  const prisma = createPrismaClient();
  seedPreviewPlannerQa(prisma)
    .then((result) => {
      console.log('preview planner QA seed:', JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
