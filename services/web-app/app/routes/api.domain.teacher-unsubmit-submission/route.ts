import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import {
  buildTeacherClassWhere,
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivities,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const POST = z
  .object({
    submissionId: z.string().min(1).optional(),
    submissionIds: z
      .preprocess(
        (value) => {
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') return [value];
          return value;
        },
        z
          .array(z.string())
          .max(100, 'No more than 100 submissions can be unsubmitted at once')
      )
      .optional(),
  })
  .transform((value, ctx) => {
    const submissionIds = Array.from(
      new Set(
        [...(value.submissionIds ?? []), value.submissionId].filter(Boolean)
      )
    ) as string[];

    if (submissionIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'At least one submission is required',
        path: ['submissionIds'],
      });
      return z.NEVER;
    }

    return { submissionIds };
  });

class TeacherUnsubmitConflictError extends Error {}

/**
 * Teacher-initiated unsubmit: withdraws a submission from active views for both
 * teacher and student. Keeps the row and any existing grade/AI feedback.
 * Allowed regardless of graded/released status for accident recovery.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can unsubmit submissions.' },
      { status: 403 }
    );
  }

  let result:
    | { kind: 'not-found'; message: string }
    | { kind: 'own-document' }
    | { kind: 'success'; unsubmittedCount: number };

  try {
    result = await prisma.$transaction(async (tx) => {
      const requestedSubmissionIds = data.submissionIds;
      const teacherClassWhere = buildTeacherClassWhere(actor);
      const submissions = await tx.submission.findMany({
        where: {
          id: { in: requestedSubmissionIds },
          document: {
            is: {
              deletedAt: null,
              ...teacherClassWhere,
            },
          },
          unsubmittedAt: null,
        },
        select: {
          id: true,
          updatedAt: true,
          gradedAt: true,
          releasedAt: true,
          unsubmittedAt: true,
          numericPercentage: true,
          overallScore: true,
          score: true,
          document: {
            select: {
              membershipId: true,
              membership: {
                select: {
                  organizationId: true,
                  userId: true,
                },
              },
              classAssignment: {
                select: {
                  class: {
                    select: {
                      school: { select: { organizationId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });

      if (submissions.length === 0) {
        return {
          kind: 'not-found' as const,
          message: 'No active submissions found.',
        };
      }

      if (submissions.length !== requestedSubmissionIds.length) {
        return {
          kind: 'not-found' as const,
          message:
            'One or more submissions are no longer eligible to unsubmit.',
        };
      }

      const hasOwnDocument = submissions.some((submission) =>
        isGradingOwnDocument(
          actor.membershipId,
          submission.document.membershipId,
          actor.userId,
          submission.document.membership?.userId
        )
      );
      if (hasOwnDocument) {
        return { kind: 'own-document' as const };
      }

      const now = new Date();
      const updateResult = await tx.submission.updateMany({
        where: {
          id: { in: submissions.map((submission) => submission.id) },
          OR: submissions.map((submission) => ({
            id: submission.id,
            updatedAt: submission.updatedAt,
          })),
          unsubmittedAt: null,
          document: {
            is: {
              deletedAt: null,
              ...teacherClassWhere,
            },
          },
        },
        data: {
          unsubmittedAt: now,
          unsubmittedByMembershipId: actor.membershipId,
        },
      });
      if (updateResult.count !== submissions.length) {
        throw new TeacherUnsubmitConflictError();
      }

      await recordSubmissionActivities(
        tx,
        submissions.map((submission) => {
          const organizationId =
            submission.document.classAssignment?.class?.school
              ?.organizationId ??
            submission.document.membership?.organizationId ??
            actor.organizationId;
          return {
            submissionId: submission.id,
            organizationId,
            actorMembershipId: resolveSubmissionActivityActorMembershipId({
              actorMembershipId: actor.membershipId,
              actorOrganizationId: actor.organizationId,
              submissionOrganizationId: organizationId,
            }),
            actorUserId: actor.userId,
            eventType: submissionActivityEventTypes.unsubmitted,
            source: 'teacher-unsubmit-submission',
            occurredAfterRelease: submission.releasedAt != null,
            changes: buildSubmissionActivityChanges({
              before: submission,
              after: {
                ...submission,
                unsubmittedAt: now,
                unsubmittedByMembershipId: actor.membershipId,
              } as any,
              fields: ['unsubmittedAt', 'unsubmittedByMembershipId'],
            }),
            metadata: {
              priorStatus:
                submission.releasedAt != null
                  ? 'released'
                  : submission.gradedAt != null
                    ? 'graded'
                    : 'submitted',
              priorNumericPercentage: submission.numericPercentage ?? undefined,
              priorOverallScore: submission.overallScore ?? undefined,
              priorScore: submission.score ?? undefined,
            },
          };
        })
      );

      return {
        kind: 'success' as const,
        unsubmittedCount: submissions.length,
      };
    });
  } catch (err) {
    if (err instanceof TeacherUnsubmitConflictError) {
      return dataResponse(
        {
          success: false,
          message:
            'This submission was already changed. Please refresh and try again.',
        },
        { status: 409 }
      );
    }
    throw err;
  }

  if (result.kind === 'not-found') {
    return dataResponse(
      { success: false, message: result.message },
      { status: 404 }
    );
  }

  if (result.kind === 'own-document') {
    return dataResponse(
      { success: false, message: 'You cannot unsubmit your own submission.' },
      { status: 403 }
    );
  }

  const message =
    result.unsubmittedCount === 1
      ? 'Submission withdrawn. The student’s document remains editable for resubmission.'
      : `${result.unsubmittedCount} submissions withdrawn. Students can edit and resubmit them.`;

  return dataResponse({
    success: true,
    message,
  });
}
