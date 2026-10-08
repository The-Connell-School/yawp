/* eslint-disable no-console */
/**
 * Preview seed-mode only: superadmin dev-login persona plus a Daily Pages
 * submission carrying a persisted grading-assistant teacherNote for QA captures.
 *
 * Never runs against production URLs or management keys — local/preview Postgres only.
 */
import type { PrismaClient } from '../generated/prisma';
import { createPassword } from './utils';
import {
  assertLocalSeedTarget,
  createPrismaClient,
} from './local-dev/connection';
import { LOCAL_DEV_PASSWORD } from './local-dev/dev-personas';
import {
  PREVIEW_TEACHER_NOTES_QA_NOTE,
  PREVIEW_TEACHER_NOTES_QA_STUDENT_EMAIL,
  PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
} from './local-dev/preview-teacher-notes-qa';
import { sampleRubricSnapshot } from './local-dev/seed-daily-pages-samples';
import { DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG } from '../../../services/web-app/app/domain/assignment-types/daily-pages-short-form-rubric.ts';

type SeedClient = PrismaClient;

export function shouldRunPreviewTeacherNotesQaSeed() {
  const mode = process.env.PREVIEW_DATA_MODE;
  return !mode || mode === 'seed';
}

export async function seedPreviewTeacherNotesQa(prisma: SeedClient) {
  const teacherMembership = await prisma.orgMembership.findFirst({
    where: {
      isActive: true,
      role: 'TEACHER',
      user: { email: 'dev.teacher@yawp.local' },
    },
    select: { organizationId: true },
  });

  if (!teacherMembership) {
    console.log(
      'seed-preview-teacher-notes-qa: no dev.teacher preview org; skipping'
    );
    return { status: 'skipped' as const, reason: 'missing-dev-teacher' };
  }

  await ensurePreviewSuperAdmin(prisma, teacherMembership.organizationId);
  const submissionId = await ensureTeacherNoteOnGradedDailyPagesSample(prisma);
  const result = {
    status: 'ok' as const,
    superadminEmail: PREVIEW_TEACHER_NOTES_QA_SUPERADMIN_EMAIL,
    submissionId,
  };
  console.log(JSON.stringify(result));
  return result;
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
      password: { create: createPassword(LOCAL_DEV_PASSWORD) },
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

async function ensureTeacherNoteOnGradedDailyPagesSample(prisma: SeedClient) {
  const submission = await prisma.submission.findFirst({
    where: {
      document: {
        assignmentType: { kind: 'daily_pages', archivedAt: null },
        membership: {
          user: { email: PREVIEW_TEACHER_NOTES_QA_STUDENT_EMAIL },
        },
      },
      gradedAt: { not: null },
    },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      document: { select: { assignmentTypeId: true } },
    },
  });

  if (!submission?.document.assignmentTypeId) {
    console.log(
      'seed-preview-teacher-notes-qa: no graded Daily Pages submission for graded student; skipping note'
    );
    return null;
  }

  const assignmentTypeId = submission.document.assignmentTypeId;
  const run = await prisma.submissionGradingAssistantRun.findFirst({
    where: { submissionId: submission.id },
    orderBy: { createdAt: 'desc' },
  });

  const metadata = {
    ...(run?.metadata && typeof run.metadata === 'object' ? run.metadata : {}),
    teacherNote: PREVIEW_TEACHER_NOTES_QA_NOTE,
    output: {
      rubricScores: {
        engagement_with_prompt: { score: 24, comment: '', isAi: true },
      },
      overallComment: 'Strong engagement with the prompt.',
      score: '24/30',
    },
  };

  if (run) {
    await prisma.submissionGradingAssistantRun.update({
      where: { id: run.id },
      data: { metadata, status: 'succeeded' },
    });
  } else {
    await prisma.submissionGradingAssistantRun.create({
      data: {
        submissionId: submission.id,
        assignmentTypeId,
        assignmentTypeGradingVersion: 1,
        assignmentTypeRubricSnapshot: sampleRubricSnapshot(),
        assignmentTypePromptConfigSnapshot:
          DAILY_PAGES_SHORT_FORM_PROMPT_CONFIG as object,
        source: 'preview-teacher-notes-qa',
        model: 'seeded-preview-qa',
        status: 'succeeded',
        metadata,
      },
    });
  }

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
    await seedPreviewTeacherNotesQa(prisma);
  } finally {
    await prisma.$disconnect();
  }
}
