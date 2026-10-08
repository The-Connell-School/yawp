/* eslint-disable no-console */
/**
 * Preview seed-mode only: superadmin dev-login persona plus a Daily Pages
 * submission carrying a persisted grading-assistant teacherNote for QA captures.
 *
 * Never runs against production URLs or management keys — local/preview Postgres only.
 */
import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '../generated/prisma';
import { createPassword } from './utils';
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import {
  PREVIEW_ENGAGEMENT_CHECK_ASSIGNMENT_TITLE,
  PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE,
  PREVIEW_TEACHER_NOTES_QA_NOTE,
  PREVIEW_TEACHER_NOTES_QA_STUDENT_EMAIL,
  PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
} from './local-dev/preview-teacher-notes-qa';
import { DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG } from '../../../services/web-app/app/domain/assignment-types/daily-pages-short-form-rubric.ts';
import {
  DAILY_PAGES_SAMPLE_ENTRIES,
} from '../../../services/web-app/app/domain/assignment-types/daily-pages-sample-entries.ts';
import dailyPagesEngagementSchema from '../../../services/web-app/app/domain/rubrics/library/daily-pages-engagement.json';
import {
  sampleEntryHtml,
  sampleRubricSnapshot,
  sampleSubmissionGradeData,
} from './local-dev/seed-daily-pages-samples';

type SeedClient = PrismaClient;

const DAILY_PAGES_ENGAGEMENT_RUBRIC_NAME = 'daily-pages-engagement';
const LEGACY_QA_TITLE = 'QA #415 Daily Pages';
const CASEY_SAMPLE_ENTRY =
  DAILY_PAGES_SAMPLE_ENTRIES.find((entry) => entry.key === 'claim-first') ??
  DAILY_PAGES_SAMPLE_ENTRIES[0];
const ENGAGEMENT_QA_SCORE = 24;

function dailyPagesEngagementRubricSnapshot() {
  const schema = dailyPagesEngagementSchema as {
    rubric: { categories: unknown[] };
    scoringScale: {
      type: string;
      minScore: number;
      maxScore: number;
      step?: number;
    };
  };
  return {
    categories: schema.rubric.categories,
    minScore: schema.scoringScale.minScore,
    maxScore: schema.scoringScale.maxScore,
    step: schema.scoringScale.step ?? 1,
    scoringType: schema.scoringScale.type,
  };
}

function previewQaSuperadminPassword(): string {
  const configured =
    process.env.PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_PASSWORD?.trim() ?? '';
  if (configured.length >= 16) return configured;
  return randomBytes(24).toString('base64url');
}

async function ensureDailyPagesEngagementTeacherNotesEnabled(
  prisma: SeedClient,
  enabled: boolean
) {
  const rubric = await prisma.rubric.findUnique({
    where: { name: DAILY_PAGES_ENGAGEMENT_RUBRIC_NAME },
  });
  if (!rubric?.schemaJson || typeof rubric.schemaJson !== 'object') return;

  const base = rubric.schemaJson as Record<string, unknown>;
  const outputSchema = {
    ...(typeof base.outputSchema === 'object' && base.outputSchema
      ? (base.outputSchema as Record<string, unknown>)
      : (dailyPagesEngagementSchema as { outputSchema?: Record<string, unknown> })
          .outputSchema ?? {}),
  };
  if (enabled) outputSchema.teacherNotesEnabled = true;
  else delete outputSchema.teacherNotesEnabled;

  const nextSchema = { ...base, outputSchema };
  // Preview QA only: update the rubric row. Do not mutate rubricRevision rows —
  // the impersonation audit trigger rejects revision updates outside the catalog API.
  await prisma.rubric.update({
    where: { id: rubric.id },
    data: { schemaJson: nextSchema },
  });
}

export function shouldRunPreviewTeacherNotesQaSeed() {
  const mode = process.env.PREVIEW_DATA_MODE;
  return !mode || mode === 'seed';
}

export async function seedPreviewTeacherNotesQa(prisma: SeedClient) {
  try {
    const teacherMembership = await prisma.orgMembership.findFirst({
      where: {
        isActive: true,
        role: 'TEACHER',
        user: { email: 'dev.teacher@yawp.local' },
      },
      select: { id: true, organizationId: true },
    });

    if (!teacherMembership) {
      console.log(
        'seed-preview-teacher-notes-qa: no dev.teacher preview org; skipping'
      );
      return { status: 'skipped' as const, reason: 'missing-dev-teacher' };
    }

    await ensurePreviewSuperAdmin(prisma, teacherMembership.organizationId);
    await ensureDailyPagesEngagementTeacherNotesEnabled(prisma, true);
    await restoreEssayGradedSamplesMutatedByLegacyQaSeed(prisma, {
      teacherMembershipId: teacherMembership.id,
    });
    const submissionId = await ensureEngagementGradedQaSubmission(prisma, {
      organizationId: teacherMembership.organizationId,
      teacherMembershipId: teacherMembership.id,
    });
    const result = {
      status: 'ok' as const,
      superadminEmail: PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
      submissionId,
    };
    console.log(JSON.stringify(result));
    return result;
  } catch (error) {
    console.error('seed-preview-teacher-notes-qa: failed (non-fatal)', error);
    return {
      status: 'error' as const,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

async function ensurePreviewSuperAdmin(
  prisma: SeedClient,
  organizationId: string
) {
  const existing = await prisma.user.findUnique({
    where: { email: PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL },
    include: {
      memberships: { where: { organizationId, isActive: true }, take: 1 },
    },
  });

  if (existing) {
    if (!existing.isSuperAdmin || !existing.isAdmin) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { isSuperAdmin: true, isAdmin: true },
      });
    }
    if (existing.memberships.length === 0) {
      await prisma.orgMembership.create({
        data: {
          userId: existing.id,
          organizationId,
          role: 'TEACHER',
          isActive: true,
        },
      });
    }
    return existing.id;
  }

  const user = await prisma.user.create({
    data: {
      email: PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
      name: 'Preview QA Superadmin',
      isAdmin: true,
      isSuperAdmin: true,
      password: { create: createPassword(previewQaSuperadminPassword()) },
      memberships: {
        create: {
          organizationId,
          role: 'TEACHER',
          isActive: true,
        },
      },
    },
  });
  return user.id;
}

function submissionLooksLikeCorruptedEssayGrade(rubricScores: unknown): boolean {
  if (!rubricScores || typeof rubricScores !== 'object') return false;
  const scores = rubricScores as Record<string, unknown>;
  return (
    'engagement_with_prompt' in scores && !('depth_of_thought' in scores)
  );
}

/**
 * Undo the legacy seed that rewrote the short-form essay sample (Casey) with an
 * engagement rubric snapshot while leaving essay-shaped submission grades.
 */
async function restoreEssayGradedSamplesMutatedByLegacyQaSeed(
  prisma: SeedClient,
  options: { teacherMembershipId: string }
) {
  const mutated = await prisma.submission.findMany({
    where: {
      OR: [
        { title: LEGACY_QA_TITLE },
        { title: CASEY_SAMPLE_ENTRY.title },
        { document: { title: LEGACY_QA_TITLE } },
        { document: { title: CASEY_SAMPLE_ENTRY.title } },
      ],
    },
    select: {
      id: true,
      title: true,
      documentId: true,
      rubricScores: true,
      document: {
        select: {
          title: true,
          assignmentTypeId: true,
          assignment: { select: { title: true } },
        },
      },
    },
  });

  for (const row of mutated) {
    const onEngagementAssignment =
      row.document?.assignment?.title ===
      PREVIEW_ENGAGEMENT_CHECK_ASSIGNMENT_TITLE;
    const renamedByLegacyQa = row.title === LEGACY_QA_TITLE;
    const corruptedEssay =
      !onEngagementAssignment &&
      (renamedByLegacyQa ||
        submissionLooksLikeCorruptedEssayGrade(row.rubricScores));

    if (!corruptedEssay || !row.document?.assignmentTypeId) continue;

    const assignmentTypeId = row.document.assignmentTypeId;
    const gradeData = sampleSubmissionGradeData(CASEY_SAMPLE_ENTRY, {
      teacherMembershipId: options.teacherMembershipId,
      assignmentTypeId,
    });

    await prisma.submission.update({
      where: { id: row.id },
      data: {
        title: CASEY_SAMPLE_ENTRY.title,
        text: CASEY_SAMPLE_ENTRY.text,
        html: sampleEntryHtml(CASEY_SAMPLE_ENTRY.text),
        ...gradeData,
      },
    });

    if (row.documentId) {
      await prisma.document.update({
        where: { id: row.documentId },
        data: {
          title: CASEY_SAMPLE_ENTRY.title,
          text: CASEY_SAMPLE_ENTRY.text,
          html: sampleEntryHtml(CASEY_SAMPLE_ENTRY.text),
        },
      });
    }

    const run = await prisma.submissionGradingAssistantRun.findFirst({
      where: { submissionId: row.id },
      orderBy: { createdAt: 'desc' },
    });
    const essayMetadata = {
      ...(run?.metadata && typeof run.metadata === 'object' ? run.metadata : {}),
    };
    delete (essayMetadata as { teacherNote?: string }).teacherNote;

    if (run) {
      await prisma.submissionGradingAssistantRun.update({
        where: { id: run.id },
        data: {
          metadata: essayMetadata,
          status: 'succeeded',
          assignmentTypeRubricSnapshot: sampleRubricSnapshot(),
          source: 'daily-pages-short-form-default',
        },
      });
    }
  }
}

async function ensureEngagementGradedQaSubmission(
  prisma: SeedClient,
  options: { organizationId: string; teacherMembershipId: string }
) {
  const studentMembership = await prisma.orgMembership.findFirst({
    where: {
      isActive: true,
      organizationId: options.organizationId,
      user: { email: PREVIEW_TEACHER_NOTES_QA_STUDENT_EMAIL },
    },
    select: { id: true },
  });
  if (!studentMembership) {
    console.log(
      'seed-preview-teacher-notes-qa: graded student persona missing; skipping engagement QA row'
    );
    return null;
  }

  const engagementAssignment = await prisma.assignment.findFirst({
    where: {
      title: PREVIEW_ENGAGEMENT_CHECK_ASSIGNMENT_TITLE,
      classAssignments: { some: { class: { organizationId: options.organizationId } } },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      assignmentTypeId: true,
      prompt: true,
      classAssignments: {
        take: 1,
        select: { id: true },
      },
    },
  });

  if (!engagementAssignment?.classAssignments[0]) {
    console.log(
      'seed-preview-teacher-notes-qa: Engagement Check (Preview) assignment missing; skipping'
    );
    return null;
  }

  const classAssignmentId = engagementAssignment.classAssignments[0].id;
  const assignmentTypeId = engagementAssignment.assignmentTypeId;
  const engagementSnapshot = dailyPagesEngagementRubricSnapshot();
  const overallComment = 'Strong engagement with the prompt.';
  const qaText =
    'This morning I noticed how the hallway smelled like rain even though it was dry outside. I kept thinking about that while I wrote, because the prompt asked what I noticed today and the smell was the only thing that felt true.';
  const qaHtml = sampleEntryHtml(qaText);
  const gradedAt = new Date();
  const submittedAt = new Date(gradedAt.getTime() - 15 * 60 * 1000);

  const metadata = {
    teacherNote: PREVIEW_TEACHER_NOTES_QA_NOTE,
    output: {
      rubricScores: {
        engagement_with_prompt: {
          score: ENGAGEMENT_QA_SCORE,
          comment: '',
          isAi: true,
        },
      },
      overallComment,
      score: `${ENGAGEMENT_QA_SCORE}/30`,
    },
  };

  const existing = await prisma.submission.findFirst({
    where: {
      title: PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE,
      document: {
        assignmentId: engagementAssignment.id,
        membershipId: studentMembership.id,
      },
    },
    select: { id: true, documentId: true },
  });

  if (existing) {
    await prisma.submission.update({
      where: { id: existing.id },
      data: {
        text: qaText,
        html: qaHtml,
        submittedAt,
        gradedAt,
        gradedByMembershipId: options.teacherMembershipId,
        overallScore: ENGAGEMENT_QA_SCORE,
        numericPercentage: Math.round((ENGAGEMENT_QA_SCORE / 30) * 100),
        score: `${ENGAGEMENT_QA_SCORE}/30`,
        overallComment,
        rubricScores: {
          engagement_with_prompt: {
            score: ENGAGEMENT_QA_SCORE,
            comment: '',
            isAi: true,
          },
        },
      },
    });
    if (existing.documentId) {
      await prisma.document.update({
        where: { id: existing.documentId },
        data: { title: PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE, text: qaText, html: qaHtml },
      });
    }

    const run = await prisma.submissionGradingAssistantRun.findFirst({
      where: { submissionId: existing.id },
      orderBy: { createdAt: 'desc' },
    });
    if (run) {
      await prisma.submissionGradingAssistantRun.update({
        where: { id: run.id },
        data: {
          metadata,
          status: 'succeeded',
          assignmentTypeRubricSnapshot: engagementSnapshot,
          assignmentTypeId,
        },
      });
    } else {
      await prisma.submissionGradingAssistantRun.create({
        data: {
          submissionId: existing.id,
          assignmentTypeId,
          assignmentTypeGradingVersion: 1,
          assignmentTypeRubricSnapshot: engagementSnapshot,
          assignmentTypePromptConfigSnapshot:
            DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG as object,
          source: 'preview-teacher-notes-qa',
          model: 'seeded-preview-qa',
          status: 'succeeded',
          metadata,
        },
      });
    }
    return existing.id;
  }

  const document = await prisma.document.create({
    data: {
      title: PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE,
      text: qaText,
      html: qaHtml,
      revision: 2,
      membershipId: studentMembership.id,
      assignmentTypeId,
      assignmentId: engagementAssignment.id,
      classAssignmentId,
    },
  });

  const submission = await prisma.submission.create({
    data: {
      documentId: document.id,
      title: PREVIEW_TEACHER_NOTES_QA_ENGAGEMENT_SUBMISSION_TITLE,
      text: qaText,
      html: qaHtml,
      submittedAt,
      gradedAt,
      gradedByMembershipId: options.teacherMembershipId,
      overallScore: ENGAGEMENT_QA_SCORE,
      numericPercentage: Math.round((ENGAGEMENT_QA_SCORE / 30) * 100),
      score: `${ENGAGEMENT_QA_SCORE}/30`,
      overallComment,
      rubricScores: {
        engagement_with_prompt: {
          score: ENGAGEMENT_QA_SCORE,
          comment: '',
          isAi: true,
        },
      },
    },
  });

  await prisma.submissionGradingAssistantRun.create({
    data: {
      submissionId: submission.id,
      assignmentTypeId,
      assignmentTypeGradingVersion: 1,
      assignmentTypeRubricSnapshot: engagementSnapshot,
      assignmentTypePromptConfigSnapshot:
        DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG as object,
      source: 'preview-teacher-notes-qa',
      model: 'seeded-preview-qa',
      status: 'succeeded',
      metadata,
    },
  });

  return submission.id;
}

if (import.meta.main) {
  if (!shouldRunPreviewTeacherNotesQaSeed()) {
    console.log(
      'seed-preview-teacher-notes-qa: skipped (PREVIEW_DATA_MODE is not seed)'
    );
    process.exit(0);
  }

  assertLocalSeedTarget();
  const prisma = createPrismaClient();
  try {
    const result = await seedPreviewTeacherNotesQa(prisma);
    if (result.status === 'error') process.exit(0);
  } finally {
    await prisma.$disconnect();
  }
}
