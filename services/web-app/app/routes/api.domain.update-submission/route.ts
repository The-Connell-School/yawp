import { type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import { hasRecordedGrade } from '~/domain/grading/recorded-grade';
import {
  buildTeacherClassWhere,
  buildGradeWriteSubjectWhere,
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionAuditValuesEqual,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';
import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import {
  isHolisticTierScoringMode,
  scoringModeFromAiMeta,
} from '~/domain/grading/scoring-mode';
import { assignmentPointTotal } from '~/domain/grading/gradeMath';

const UNSUBMITTED_BEFORE_GRADED_MESSAGE =
  'This submission was unsubmitted before you could grade it. Please refresh the page.';
const STALE_GRADE_MESSAGE =
  'This submission changed before your grade could be saved. Please refresh and try again.';

class GradeSaveConflictError extends Error {}

export async function action({ request }: ActionFunctionArgs) {
  const body = await request.json();
  const { submissionId, expectedUpdatedAt, ...fields } = body;

  if (!submissionId || typeof submissionId !== 'string') {
    return Response.json(
      { success: false, message: 'submissionId is required.' },
      { status: 400 }
    );
  }

  const parsedExpectedUpdatedAt =
    typeof expectedUpdatedAt === 'string' &&
    Number.isFinite(Date.parse(expectedUpdatedAt))
      ? new Date(expectedUpdatedAt)
      : null;
  if (expectedUpdatedAt != null && parsedExpectedUpdatedAt == null) {
    return Response.json(
      {
        success: false,
        message: 'expectedUpdatedAt must be an ISO timestamp.',
      },
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
      updatedAt: true,
      gradedAt: true,
      gradedByMembershipId: true,
      releasedAt: true,
      feedback: true,
      rubricScores: true,
      numericPercentage: true,
      overallScore: true,
      score: true,
      overallComment: true,
      letterGrade: true,
      grammarIssues: true,
      promptConfig: true,
      aiMeta: true,
      unsubmittedAt: true,
      document: {
        select: {
          membershipId: true,
          assignmentTypeId: true,
          membership: {
            select: {
              userId: true,
              organizationId: true,
              organization: {
                select: { submissionActivityEnabled: true },
              },
              classesAsStudent: {
                select: {
                  id: true,
                  schoolId: true,
                  school: {
                    select: {
                      organizationId: true,
                      organization: {
                        select: { submissionActivityEnabled: true },
                      },
                    },
                  },
                  teachers: { select: { id: true } },
                },
              },
            },
          },
          assignment: {
            select: {
              id: true,
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
                  school: {
                    select: {
                      organizationId: true,
                      organization: {
                        select: { submissionActivityEnabled: true },
                      },
                    },
                  },
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
    parsedExpectedUpdatedAt != null &&
    submission.updatedAt?.getTime() !== parsedExpectedUpdatedAt.getTime()
  ) {
    return Response.json(
      { success: false, message: STALE_GRADE_MESSAGE },
      { status: 409 }
    );
  }

  if (
    isGradingOwnDocument(
      actor.membershipId,
      submission.document.membershipId,
      actor.userId,
      submission.document.membership?.userId
    )
  ) {
    return Response.json(
      { success: false, message: 'You cannot grade your own submission.' },
      { status: 403 }
    );
  }

  const organizationId =
    submission.document.classAssignment?.class?.school?.organizationId ??
    submission.document.membership?.organizationId ??
    actor.organizationId;
  const gradeActorMembershipId = resolveSubmissionActivityActorMembershipId({
    actorMembershipId: actor.membershipId,
    actorOrganizationId: actor.organizationId,
    submissionOrganizationId: organizationId,
  });
  const submissionActivityEnabled =
    (submission.document.classAssignment?.class?.school?.organization
      ?.submissionActivityEnabled ??
      submission.document.membership?.organization
        ?.submissionActivityEnabled) === true;

  if (!actor.isAdmin && organizationId !== actor.organizationId) {
    return Response.json(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  if (submission.releasedAt != null && !submissionActivityEnabled) {
    return Response.json(
      {
        success: false,
        message: 'Released grades are read-only for this organization.',
      },
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
      v === null || (typeof v === 'number' && Number.isFinite(v)) ? v : undefined,
    letterGrade: (v) => (v === null || typeof v === 'string' ? v : undefined),
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
    // A grade counts when it exists on the rubric's own scale, whether that
    // is a percentage or the raw points a points scale reports instead.
    // Grade fields arriving in this same request count too.
    const isGraded =
      hasRecordedGrade({
        numericPercentage: data.numericPercentage as number | undefined,
        overallScore: data.overallScore as number | undefined,
        score: data.score as string | undefined,
      }) ||
      hasRecordedGrade({
        numericPercentage: submission.numericPercentage,
        overallScore: submission.overallScore,
        score: submission.score,
      });

    if (!isGraded) {
      return Response.json(
        {
          success: false,
          message: 'An overall grade is required before marking as graded.',
        },
        { status: 400 }
      );
    }

    if (!submission.gradedAt) {
      data.gradedAt = new Date();
    }
    data.gradedByMembershipId = gradeActorMembershipId;
  }

  const assignmentTypeId = submission.document.assignmentTypeId;
  let holisticTier = scoringModeFromAiMeta(submission.aiMeta) === 'holistic_tier';
  let holisticPointTotalFallback = 100;
  if (assignmentTypeId) {
    try {
      const gradingConfig = await resolveAssignmentTypeGradingConfig({
        assignmentTypeId,
        assignmentId: submission.document.assignment?.id ?? undefined,
      });
      holisticTier =
        isHolisticTierScoringMode(gradingConfig.scoringMode) || holisticTier;
      holisticPointTotalFallback =
        gradingConfig.rubricTotalPoints ?? gradingConfig.maxScore ?? 100;
    } catch {
      // Type/assignment mismatch or missing context: rely on aiMeta when present.
    }
  }
  if (holisticTier) {
    data.numericPercentage = null;
    data.letterGrade = null;
    const pointValue = submission.document.assignment?.pointValue;
    const total = assignmentPointTotal(pointValue, holisticPointTotalFallback);
    const earned =
      typeof data.overallScore === 'number' && Number.isFinite(data.overallScore)
        ? Math.round(data.overallScore)
        : typeof submission.overallScore === 'number'
          ? Math.round(submission.overallScore)
          : null;
    if (earned !== null) {
      data.overallScore = earned;
      data.score = `${earned}/${total}`;
    } else if (
      typeof data.score === 'string' &&
      !/^\s*\d+\s*\/\s*\d+\s*$/.test(data.score)
    ) {
      data.score = submission.score;
    }
  }

  const activityChanges = buildSubmissionActivityChanges({
    before: submission,
    after: { ...submission, ...data },
  });
  const changedFields = Object.keys(data).filter((field) => {
    const before = submission[field as keyof typeof submission];
    const after = data[field];
    return !submissionAuditValuesEqual(before, after);
  });

  if (changedFields.length === 0) {
    return Response.json({
      success: true,
      submission: { id: submission.id, updatedAt: submission.updatedAt },
    });
  }

  data.updatedAt = new Date();

  // Keep unsubmittedAt in the write predicate (same style as unsubmit's own
  // optimistic-concurrency guard) so a student's unsubmit that lands between
  // the read above and this write cannot silently win the race.
  try {
    await prisma.$transaction(async (tx) => {
      const updateResult = await tx.submission.updateMany({
        where: {
          id: submission.id,
          unsubmittedAt: null,
          document: {
            is: {
              deletedAt: null,
              AND: [
                buildGradeWriteSubjectWhere({
                  actorUserId: actor.userId,
                  releasedAt: submission.releasedAt,
                }),
                teacherClassWhere,
              ],
            },
          },
          ...(parsedExpectedUpdatedAt == null && submission.updatedAt == null
            ? {}
            : { updatedAt: parsedExpectedUpdatedAt ?? submission.updatedAt }),
        },
        data,
      });

      if (updateResult.count !== 1) {
        throw new GradeSaveConflictError();
      }

      await recordSubmissionActivity(tx, {
        submissionId: submission.id,
        organizationId,
        actorMembershipId: gradeActorMembershipId,
        actorUserId: actor.userId,
        eventType:
          activityChanges.gradedAt || activityChanges.gradedByMembershipId
            ? submissionActivityEventTypes.gradeFinalized
            : submissionActivityEventTypes.gradeUpdated,
        source: 'update-submission',
        occurredAfterRelease: submission.releasedAt != null,
        changes: activityChanges,
        ...(Object.keys(activityChanges).length === 0
          ? { metadata: { changedFields } }
          : {}),
      });
    });
  } catch (err) {
    if (err instanceof GradeSaveConflictError) {
      return Response.json(
        { success: false, message: STALE_GRADE_MESSAGE },
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
