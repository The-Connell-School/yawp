/* eslint-disable no-console */
/**
 * Preview-only QA fixtures for Lesson Planner ship review. Never run on production.
 * Invoked from scripts/preview/deploy.sh after local-dev / fixture seeding.
 */
import { Prisma } from '../generated/prisma';
import { composeExitTicketPrompt } from '../../../services/web-app/app/domain/assignment-types/exit-ticket';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';
import { createPrismaClient } from './local-dev/connection';
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

export function assertPreviewPlannerQaTarget(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.trim()) {
    throw new Error('DATABASE_URL is required');
  }
  const isPreviewDb = /yawp_pr_\d+/i.test(databaseUrl) || /yawp_demo/i.test(databaseUrl);
  if (!isPreviewDb && !isLocalDatabaseUrl(databaseUrl)) {
    throw new Error('preview planner QA seed only runs on preview or local databases');
  }
  if (process.env.NODE_ENV === 'production' && !isPreviewDb) {
    throw new Error('preview planner QA seed refused in production');
  }
}

export async function seedPreviewPlannerQa(
  prisma: ReturnType<typeof createPrismaClient>
) {
  const teacher = await prisma.orgMembership.findFirst({
    where: {
      role: 'TEACHER',
      isActive: true,
      user: { email: PREVIEW_PLANNER_QA_TEACHER_EMAIL },
    },
    select: { id: true, organizationId: true },
  });
  if (!teacher) {
    console.log('preview planner QA: dev.teacher not found; skipping');
    return { skipped: true as const };
  }

  await enableClassInsightsForOrganizations(prisma, [teacher.organizationId]);

  const student = await prisma.orgMembership.findFirst({
    where: {
      role: 'STUDENT',
      isActive: true,
      user: { email: PREVIEW_PLANNER_QA_STUDENT_EMAIL },
    },
    select: { id: true },
  });

  const school = await prisma.school.findFirst({
    where: { organizationId: teacher.organizationId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (!school) {
    console.log('preview planner QA: no school for dev.teacher; skipping');
    return { skipped: true as const };
  }

  // Stable class id so preview QA URLs never drift when dev.teacher already
  // teaches another section on a preserved database.
  const klass = await prisma.class.upsert({
    where: { id: PREVIEW_PLANNER_QA_IDS.classId },
    update: {
      title: '[QA] Lesson planner preview class',
      isArchived: false,
      teachers: { connect: [{ id: teacher.id }] },
      ...(student ? { students: { connect: [{ id: student.id }] } } : {}),
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
      ...(student ? { students: { connect: [{ id: student.id }] } } : {}),
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

  if (!exitTicketType || !student) {
    console.log('preview planner QA: exit ticket type or dev.student missing');
    return {
      skipped: false as const,
      classId: klass.id,
      assignmentId: insightAssignment?.id ?? null,
      classAssignmentId: insightClassAssignment?.id ?? null,
    };
  }

  const exitConfig = {
    schemaVersion: 1,
    mode: 'specific' as const,
    focus: 'explain-concept',
    topic: 'what a comma splice is and how to fix one',
    answerType: 'objective' as const,
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
  });

  const exitClassAssignment = await prisma.classAssignment.upsert({
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

  const exitModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: exitTicketType.id, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: { orderBy: { position: 'asc' }, take: 1 },
    },
  });
  const firstModule = exitModules[0];
  const firstInstruction = firstModule?.instructions[0];

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
      assignmentTypeId: exitTicketType.id,
      assignmentId: exitAssignment.id,
      classAssignmentId: exitClassAssignment.id,
    },
    create: {
      id: PREVIEW_PLANNER_QA_IDS.exitTicketDocumentId,
      title: exitAssignment.title ?? '[QA] Exit ticket',
      text: responseText,
      html: responseHtml,
      membershipId: student.id,
      assignmentTypeId: exitTicketType.id,
      assignmentId: exitAssignment.id,
      classAssignmentId: exitClassAssignment.id,
      ...(firstModule && firstInstruction
        ? {
            assignmentModuleSessions: {
              create: [
                {
                  assignmentModuleId: firstModule.id,
                  instructionsCompleted: 1,
                  messages: {
                    create: [
                      {
                        content: firstInstruction.prompt,
                        agent: 'assistant',
                        instructionId: firstInstruction.id,
                      },
                    ],
                  },
                },
              ],
            },
          }
        : {}),
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
  assertPreviewPlannerQaTarget();
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
