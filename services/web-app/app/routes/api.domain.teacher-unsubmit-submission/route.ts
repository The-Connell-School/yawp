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
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const POST = z.object({ submissionId: z.string().min(1) });

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
    | { kind: 'not-found' }
    | { kind: 'own-document' }
    | { kind: 'success' };

  try {
    result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id: data.submissionId,
          document: {
            is: {
              deletedAt: null,
              ...buildTeacherClassWhere(actor),
            },
          },
        },
        select: {
          id: true,
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
            },
          },
        },
      });

      if (!submission) {
        return { kind: 'not-found' as const };
      }

      if (
        isGradingOwnDocument(
          actor.membershipId,
          submission.document.membershipId,
          actor.userId,
          submission.document.membership.userId
        )
      ) {
        return { kind: 'own-document' as const };
      }

      const now = new Date();
      const updateResult = await tx.submission.updateMany({
        where: {
          id: submission.id,
          unsubmittedAt: null,
          document: {
            is: {
              deletedAt: null,
              AND: [
                {
                  membership: {
                    is: {
                      userId: { not: actor.userId },
                    },
                  },
                },
                buildTeacherClassWhere(actor),
              ],
            },
          },
        },
        data: {
          unsubmittedAt: now,
          unsubmittedByMembershipId: actor.membershipId,
        },
      });
      if (updateResult.count !== 1) {
        throw new TeacherUnsubmitConflictError();
      }

      const organizationId =
        submission.document.membership.organizationId ?? actor.organizationId;
      await recordSubmissionActivity(tx, {
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
      });

      return { kind: 'success' as const };
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
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  if (result.kind === 'own-document') {
    return dataResponse(
      { success: false, message: 'You cannot unsubmit your own submission.' },
      { status: 403 }
    );
  }

  return dataResponse({
    success: true,
    message:
      'Submission withdrawn. The student’s document remains editable for resubmission.',
  });
}

