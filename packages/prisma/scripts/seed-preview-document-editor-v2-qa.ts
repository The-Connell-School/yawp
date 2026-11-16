/* eslint-disable no-console */
/**
 * Preview seed-mode only: stable v2 student + graded documents for PR capture QA.
 */
import type { PrismaClient } from '../generated/prisma';
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  PREVIEW_DOC_EDITOR_V2_QA_ACTIVE_COMMENT_ID,
  PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID,
  PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_TITLE,
  PREVIEW_DOC_EDITOR_V2_QA_EDITED_TEXT,
  PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID,
  PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_TITLE,
  PREVIEW_DOC_EDITOR_V2_QA_GRADED_STUDENT_EMAIL,
  PREVIEW_DOC_EDITOR_V2_QA_MARGIN_COMMENT_B_ID,
  PREVIEW_DOC_EDITOR_V2_QA_MARGIN_COMMENT_C_ID,
  PREVIEW_DOC_EDITOR_V2_QA_RESOLVED_COMMENT_ID,
  PREVIEW_DOC_EDITOR_V2_QA_STUDENT_EMAIL,
  PREVIEW_DOC_EDITOR_V2_QA_TEACHER_EMAIL,
} from './local-dev/preview-document-editor-v2-qa';

type SeedClient = PrismaClient;

const PR_PREVIEW_DATABASE_NAME = /^yawp_pr_[0-9]+$/;
const THESIS_ASSIGNMENT_TITLE = 'Thesis essay: civic responsibility';

export function previewDocumentEditorV2QaDatabaseAllowed(
  databaseUrl = process.env.DATABASE_URL
): boolean {
  if (!databaseUrl?.trim()) return false;
  try {
    const normalized = databaseUrl.replace(/^postgres:/, 'postgresql:');
    const pathname = new URL(normalized).pathname.replace(/^\//, '');
    const databaseName = pathname.split('/')[0]?.split('?')[0] ?? '';
    return PR_PREVIEW_DATABASE_NAME.test(databaseName);
  } catch {
    return false;
  }
}

export function shouldRunPreviewDocumentEditorV2QaSeed() {
  const mode = process.env.PREVIEW_DATA_MODE;
  return !mode || mode === 'seed';
}

function editedHtmlWithMarginMarks() {
  return `<p>This are a practice essay with <span class="comment-mark" data-comment-id="${PREVIEW_DOC_EDITOR_V2_QA_MARGIN_COMMENT_B_ID}">grammar mistake</span>. I went to the store, I buyed milk and bread. The <span class="comment-mark" data-comment-id="${PREVIEW_DOC_EDITOR_V2_QA_MARGIN_COMMENT_C_ID}">students</span> was excited for <span class="comment-mark" data-comment-id="${PREVIEW_DOC_EDITOR_V2_QA_ACTIVE_COMMENT_ID}">writing</span>.</p>`;
}

function gradedHtmlWithMarks() {
  return `<p><span class="comment-mark" data-comment-id="${PREVIEW_DOC_EDITOR_V2_QA_ACTIVE_COMMENT_ID}">Education is the foundation of society</span>. Through learning, <span class="comment-mark" data-comment-id="${PREVIEW_DOC_EDITOR_V2_QA_RESOLVED_COMMENT_ID}">students develop critical thinking skills</span> that serve them throughout life.</p>`;
}

const gradedText =
  'Education is the foundation of society. Through learning, students develop critical thinking skills that serve them throughout life.';

export async function seedPreviewDocumentEditorV2Qa(prisma: SeedClient) {
  try {
    if (!previewDocumentEditorV2QaDatabaseAllowed()) {
      console.log(
        'seed-preview-document-editor-v2-qa: skipped (not yawp_pr_<n> database)'
      );
      return { status: 'skipped' as const, reason: 'non-pr-preview-database' };
    }

    const studentMembership = await prisma.orgMembership.findFirst({
      where: {
        isActive: true,
        user: { email: PREVIEW_DOC_EDITOR_V2_QA_STUDENT_EMAIL },
      },
      select: { id: true, organizationId: true },
    });
    const teacherMembership = await prisma.orgMembership.findFirst({
      where: {
        isActive: true,
        user: { email: PREVIEW_DOC_EDITOR_V2_QA_TEACHER_EMAIL },
      },
      select: { id: true, organizationId: true },
    });
    const gradedStudentMembership = await prisma.orgMembership.findFirst({
      where: {
        isActive: true,
        user: { email: PREVIEW_DOC_EDITOR_V2_QA_GRADED_STUDENT_EMAIL },
      },
      select: { id: true },
    });

    if (!studentMembership || !teacherMembership) {
      console.log(
        'seed-preview-document-editor-v2-qa: missing dev student/teacher; skipping'
      );
      return { status: 'skipped' as const, reason: 'missing-personas' };
    }

  const thesisContext = await resolveThesisAssignmentContext(
    prisma,
    studentMembership.organizationId
  );
  if (!thesisContext) {
    console.log(
      'seed-preview-document-editor-v2-qa: thesis assignment context missing; skipping'
    );
    return { status: 'skipped' as const, reason: 'missing-thesis-assignment' };
  }

    const inProgressId = await ensureInProgressV2Document(prisma, {
      studentMembershipId: studentMembership.id,
      teacherMembershipId: teacherMembership.id,
      ...thesisContext,
    });

    let gradedDocumentId: string | null = null;
    if (gradedStudentMembership) {
      gradedDocumentId = await ensureGradedV2Document(prisma, {
        studentMembershipId: gradedStudentMembership.id,
        teacherMembershipId: teacherMembership.id,
        ...thesisContext,
      });
    }

    const result = {
      status: 'ok' as const,
      inProgressDocumentId: inProgressId,
      gradedDocumentId,
    };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('seed-preview-document-editor-v2-qa: failed (non-fatal)', error);
    return {
      status: 'error' as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveThesisAssignmentContext(
  prisma: SeedClient,
  organizationId: string
) {
  const assignment = await prisma.assignment.findFirst({
    where: {
      title: THESIS_ASSIGNMENT_TITLE,
      assignmentType: {
        organizationAssignments: { some: { organizationId } },
      },
    },
    select: {
      id: true,
      assignmentTypeId: true,
      classAssignments: { take: 1, select: { id: true } },
      assignmentType: {
        select: {
          assignmentModules: {
            where: { deletedAt: null },
            orderBy: { position: 'asc' },
            select: { id: true, position: true, title: true },
          },
        },
      },
    },
  });
  const classAssignmentId = assignment?.classAssignments[0]?.id;
  if (!assignment || !classAssignmentId) return null;
  return {
    assignmentId: assignment.id,
    classAssignmentId,
    assignmentTypeId: assignment.assignmentTypeId,
    moduleIds: assignment.assignmentType.assignmentModules.map((m) => m.id),
  };
}

async function ensureInProgressV2Document(
  prisma: SeedClient,
  options: {
    studentMembershipId: string;
    teacherMembershipId: string;
    assignmentId: string;
    classAssignmentId: string;
    assignmentTypeId: string;
    moduleIds: string[];
  }
) {
  const html = editedHtmlWithMarginMarks();
  const existingSubmissions = await prisma.submission.count({
    where: { documentId: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID },
  });

  await prisma.document.upsert({
    where: { id: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID },
    create: {
      id: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID,
      title: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_TITLE,
      text: PREVIEW_DOC_EDITOR_V2_QA_EDITED_TEXT,
      html,
      revision: 2,
      membershipId: options.studentMembershipId,
      assignmentTypeId: options.assignmentTypeId,
      assignmentId: options.assignmentId,
      classAssignmentId: options.classAssignmentId,
      assignmentModuleSessions: options.moduleIds.length
        ? {
            create: options.moduleIds.map((assignmentModuleId, index) => ({
              assignmentModuleId,
              title: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_TITLE,
              instructionsCompleted: index === 0 ? 1 : 0,
            })),
          }
        : undefined,
    },
    update: {
      title: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_TITLE,
      text: PREVIEW_DOC_EDITOR_V2_QA_EDITED_TEXT,
      html,
      membershipId: options.studentMembershipId,
      assignmentId: options.assignmentId,
      classAssignmentId: options.classAssignmentId,
    },
  });

  if (existingSubmissions > 0) {
    await prisma.submission.deleteMany({
      where: { documentId: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID },
    });
  }

  await upsertMarginComments(prisma, {
    documentId: PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID,
    teacherMembershipId: options.teacherMembershipId,
    studentMembershipId: options.studentMembershipId,
    includeStudentReply: true,
  });

  return PREVIEW_DOC_EDITOR_V2_QA_DOCUMENT_ID;
}

async function ensureGradedV2Document(
  prisma: SeedClient,
  options: {
    studentMembershipId: string;
    teacherMembershipId: string;
    assignmentId: string;
    classAssignmentId: string;
    assignmentTypeId: string;
    moduleIds: string[];
  }
) {
  const html = gradedHtmlWithMarks();
  await prisma.document.upsert({
    where: { id: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID },
    create: {
      id: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID,
      title: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_TITLE,
      text: gradedText,
      html,
      revision: 4,
      membershipId: options.studentMembershipId,
      assignmentTypeId: options.assignmentTypeId,
      assignmentId: options.assignmentId,
      classAssignmentId: options.classAssignmentId,
      assignmentModuleSessions: options.moduleIds.length
        ? {
            create: options.moduleIds.map((assignmentModuleId) => ({
              assignmentModuleId,
              title: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_TITLE,
              instructionsCompleted: 1,
            })),
          }
        : undefined,
    },
    update: {
      title: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_TITLE,
      text: gradedText,
      html,
      membershipId: options.studentMembershipId,
    },
  });

  const submissionPayload = {
    html,
    text: gradedText,
    title: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_TITLE,
    submittedAt: new Date(Date.now() - 86_400_000),
    gradedByMembershipId: options.teacherMembershipId,
    gradedAt: new Date(),
    numericPercentage: 82,
    letterGrade: 'B',
    overallScore: 4,
    overallComment: 'Strong thesis with room to deepen evidence.',
    releasedAt: new Date(),
  };
  const existingSubmission = await prisma.submission.findFirst({
    where: { documentId: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });
  if (existingSubmission) {
    await prisma.submission.update({
      where: { id: existingSubmission.id },
      data: submissionPayload,
    });
  } else {
    await prisma.submission.create({
      data: {
        documentId: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID,
        ...submissionPayload,
      },
    });
  }

  await upsertMarginComments(prisma, {
    documentId: PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID,
    teacherMembershipId: options.teacherMembershipId,
    studentMembershipId: options.studentMembershipId,
    includeStudentReply: true,
  });

  return PREVIEW_DOC_EDITOR_V2_QA_GRADED_DOCUMENT_ID;
}

async function upsertMarginComments(
  prisma: SeedClient,
  options: {
    documentId: string;
    teacherMembershipId: string;
    studentMembershipId: string;
    includeStudentReply: boolean;
  }
) {
  const comments = [
    {
      id: PREVIEW_DOC_EDITOR_V2_QA_ACTIVE_COMMENT_ID,
      content: 'Strong opening — keep this energy in the body paragraphs.',
      archivedAt: null as Date | null,
    },
    {
      id: PREVIEW_DOC_EDITOR_V2_QA_MARGIN_COMMENT_B_ID,
      content: 'Subject–verb agreement here.',
      archivedAt: null as Date | null,
    },
    {
      id: PREVIEW_DOC_EDITOR_V2_QA_MARGIN_COMMENT_C_ID,
      content: 'Try a more precise noun than “students”.',
      archivedAt: null as Date | null,
    },
    {
      id: PREVIEW_DOC_EDITOR_V2_QA_RESOLVED_COMMENT_ID,
      content: 'Consider adding more specific examples to support your claims.',
      archivedAt: new Date(),
    },
  ];

  for (const comment of comments) {
    await prisma.documentComment.upsert({
      where: { id: comment.id },
      create: {
        id: comment.id,
        documentId: options.documentId,
        membershipId: options.teacherMembershipId,
        content: comment.content,
        archivedAt: comment.archivedAt,
      },
      update: {
        content: comment.content,
        archivedAt: comment.archivedAt,
      },
    });
  }

  if (options.includeStudentReply) {
    const existing = await prisma.documentCommentResponse.findFirst({
      where: { commentId: PREVIEW_DOC_EDITOR_V2_QA_ACTIVE_COMMENT_ID },
    });
    if (!existing) {
      await prisma.documentCommentResponse.create({
        data: {
          commentId: PREVIEW_DOC_EDITOR_V2_QA_ACTIVE_COMMENT_ID,
          membershipId: options.studentMembershipId,
          content: 'Thanks — I will expand this section.',
        },
      });
    }
  }
}

if (import.meta.main) {
  assertLocalSeedTarget();
  if (!shouldRunPreviewDocumentEditorV2QaSeed()) {
    console.log(
      'seed-preview-document-editor-v2-qa: skipped (PREVIEW_DATA_MODE is not seed)'
    );
    process.exit(0);
  }
  const prisma = createPrismaClient();
  try {
    const result = await seedPreviewDocumentEditorV2Qa(prisma);
    if (result.status === 'error') process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}