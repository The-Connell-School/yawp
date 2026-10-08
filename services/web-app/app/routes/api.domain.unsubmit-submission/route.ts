import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { getGradingActor } from '~/utils/grading-auth.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const POST = z.object({ submissionId: z.string().min(1) });

class UnsubmitConflictError extends Error {}

/**
 * Student-initiated "unsubmit": marks a submission as withdrawn without
 * deleting the row. Only Submission.unsubmittedAt/unsubmittedByMembershipId
 * are written, and only before grading has finished. The underlying Document
 * and DocumentRevision rows are never touched, so the student's document and
 * its full revision history survive untouched. Once unsubmitted, this
 * submission stops counting as "active" everywhere active submissions are
 * read, which is what lets the student edit and resubmit.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (actor.isTeacher || actor.isAdmin) {
    return dataResponse(
      { success: false, message: 'Only students can unsubmit their own work.' },
      { status: 403 }
    );
  }

  let result: { kind: 'not-found' } | { kind: 'graded' } | { kind: 'success' };

  try {
    result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id: data.submissionId,
          unsubmittedAt: null,
          document: {
            is: {
              OR: [
                { membershipId: actor.membershipId },
                {
                  group: {
                    is: {
                      members: {
                        some: {
                          membershipId: actor.membershipId,
                          removedAt: null,
                        },
                      },
                    },
                  },
                  classAssignment: {
                    is: {
                      class: {
                        school: { organizationId: actor.organizationId },
                        students: { some: { id: actor.membershipId } },
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        select: {
          id: true,
          gradedAt: true,
          releasedAt: true,
          unsubmittedAt: true,
          unsubmittedByMembershipId: true,
          document: {
            select: {
              membership: { select: { organizationId: true } },
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

      if (!submission) {
        return { kind: 'not-found' as const };
      }

      // gradedAt is the normal lifecycle boundary. releasedAt is also checked
      // defensively so inconsistent legacy data cannot make a released grade
      // withdrawable even if gradedAt is unexpectedly null.
      if (submission.gradedAt != null || submission.releasedAt != null) {
        return { kind: 'graded' as const };
      }

      const now = new Date();

      // Keep every eligibility field in the predicate so a concurrent
      // unsubmit, grade finalization, or release cannot silently win a race.
      const updateResult = await tx.submission.updateMany({
        where: {
          id: submission.id,
          unsubmittedAt: null,
          gradedAt: null,
          releasedAt: null,
          document: {
            is: {
              OR: [
                { membershipId: actor.membershipId },
                {
                  group: {
                    is: {
                      members: {
                        some: {
                          membershipId: actor.membershipId,
                          removedAt: null,
                        },
                      },
                    },
                  },
                  classAssignment: {
                    is: {
                      class: {
                        school: { organizationId: actor.organizationId },
                        students: { some: { id: actor.membershipId } },
                      },
                    },
                  },
                },
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
        throw new UnsubmitConflictError();
      }

      const submissionOrganizationId =
        submission.document.classAssignment?.class?.school?.organizationId ??
        submission.document.membership?.organizationId ??
        actor.organizationId;
      await recordSubmissionActivity(tx, {
        submissionId: submission.id,
        organizationId: submissionOrganizationId,
        actorMembershipId: resolveSubmissionActivityActorMembershipId({
          actorMembershipId: actor.membershipId,
          actorOrganizationId: actor.organizationId,
          submissionOrganizationId,
        }),
        actorUserId: actor.userId,
        eventType: submissionActivityEventTypes.unsubmitted,
        source: 'unsubmit-submission',
        occurredAfterRelease: false,
        changes: buildSubmissionActivityChanges({
          before: submission,
          after: {
            ...submission,
            unsubmittedAt: now,
            unsubmittedByMembershipId: actor.membershipId,
          },
          fields: ['unsubmittedAt', 'unsubmittedByMembershipId'],
        }),
      });

      return { kind: 'success' as const };
    });
  } catch (err) {
    if (err instanceof UnsubmitConflictError) {
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
      {
        success: false,
        message:
          'Submission not found, already unsubmitted, or you do not have permission to unsubmit it.',
      },
      { status: 404 }
    );
  }

  if (result.kind === 'graded') {
    return dataResponse(
      {
        success: false,
        message:
          "This submission can't be unsubmitted right now. Ask your teacher if you need to make changes.",
      },
      { status: 409 }
    );
  }

  return dataResponse({
    success: true,
    message:
      'Submission withdrawn. Your document was not deleted and can be edited and resubmitted.',
  });
}
