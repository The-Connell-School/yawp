import { type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import {
  buildTeacherClassWhere,
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';

const UNSUBMITTED_BEFORE_GRADED_MESSAGE =
  'This submission was unsubmitted before you could grade it. Please refresh the page.';

class GradeSaveConflictError extends Error {}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const { submissionId, ...fields } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return Response.json(
      { success: false, message: 'submissionId is required.' },
      { status: 400 }
    );
  }

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return Response.json(
      { success: false, message: 'Only teachers can update submissions.' },
      { status: 403 }
    );
  }

  const teacherClassWhere = buildTeacherClassWhere(actor);

  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      document: {
        is: {
          deletedAt: null,
          ...teacherClassWhere,
        },
      },
    },
    select: {
      id: true,
      gradedAt: true,
      gradedByMembershipId: true,
      numericPercentage: true,
      unsubmittedAt: true,
      document: {
        select: {
          membershipId: true,
          assignment: {
            select: {
              submitForGrade: true,
              pointValue: true,
            },
          },
          classAssignment: {
            select: {
              class: {
                select: {
                  id: true,
                  schoolId: true,
                  school: { select: { organizationId: true } },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
          membership: {
            select: {
              classesAsStudent: {
                select: {
                  id: true,
                  schoolId: true,
                  school: { select: { organizationId: true } },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!submission) {
    return Response.json(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  if (
    isGradingOwnDocument(
      actor.membershipId,
      submission.document.membershipId
    )
  ) {
    return Response.json(
      { success: false, message: 'You cannot grade your own submission.' },
      { status: 403 }
    );
  }

  // A student can unsubmit while a teacher has the grading screen open. If
  // that happened before this save reaches the database, refuse the write
  // rather than saving a grade onto a withdrawn submission.
  if (submission.unsubmittedAt != null) {
    return Response.json(
      { success: false, message: UNSUBMITTED_BEFORE_GRADED_MESSAGE },
      { status: 409 }
    );
  }

  // Allowlist of grading fields that can be updated
  const allowedFields: Record<string, (v: unknown) => unknown> = {
    score: (v) => (typeof v === 'string' ? v : undefined),
    feedback: (v) => (typeof v === 'string' ? v : undefined),
    rubricScores: (v) => (v != null ? v : undefined),
    overallScore: (v) =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined,
    overallComment: (v) => (typeof v === 'string' ? v : undefined),
    numericPercentage: (v) =>
      typeof v === 'number' && Number.isFinite(v) ? v : undefined,
    letterGrade: (v) => (typeof v === 'string' ? v : undefined),
    grammarIssues: (v) => (v != null ? v : undefined),
    promptConfig: (v) => (v != null ? v : undefined),
    aiMeta: (v) => (v != null ? v : undefined),
  };

  const data: Record<string, unknown> = {};
  for (const [key, transform] of Object.entries(allowedFields)) {
    if (key in fields) {
      const value = transform(fields[key]);
      if (value !== undefined) {
        data[key] = value;
      }
    }
  }

  // Explicitly mark as graded when requested
  if (fields.markAsGraded) {
    const incomingNumericPercentage =
      typeof fields.numericPercentage === 'number' &&
      Number.isFinite(fields.numericPercentage)
        ? fields.numericPercentage
        : undefined;
    const hasNumericGrade =
      incomingNumericPercentage !== undefined ||
      submission.numericPercentage != null;

    if (!hasNumericGrade) {
      return Response.json(
        {
          success: false,
          message: 'An overall percentage is required before marking as graded.',
        },
        { status: 400 }
      );
    }

    if (!submission.gradedAt) {
      data.gradedAt = new Date();
    }
    data.gradedByMembershipId = actor.membershipId;
  }

  data.updatedAt = new Date();

  // Keep unsubmittedAt in the write predicate (same style as unsubmit's own
  // optimistic-concurrency guard) so a student's unsubmit that lands between
  // the read above and this write cannot silently win the race.
  try {
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.submission.updateMany({
        where: { id: submission.id, unsubmittedAt: null },
        data,
      });

      if (updateResult.count !== 1) {
        throw new GradeSaveConflictError();
      }
    });
  } catch (err) {
    if (err instanceof GradeSaveConflictError) {
      return Response.json(
        { success: false, message: UNSUBMITTED_BEFORE_GRADED_MESSAGE },
        { status: 409 }
      );
    }
    throw err;
  }

  return Response.json({
    success: true,
    submission: { id: submission.id, ...data },
  });
}
