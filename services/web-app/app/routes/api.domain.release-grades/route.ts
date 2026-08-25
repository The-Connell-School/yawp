import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { redirectWithToast } from '~/utils/toast.server';
import {
  buildTeacherClassWhere,
  canManageGrades,
  getGradingActor,
} from '~/utils/grading-auth.server';
import {
  buildSubmissionActivityChanges,
  recordSubmissionActivities,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';
import { maybePostGradeToBlackboard } from '~/integrations/blackboard-ags.server';

const POST = z.object({
  submissionIds: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return [value];
      return value;
    },
    z
      .array(z.string())
      .min(1, 'At least one submission is required')
      .max(500, 'No more than 500 submissions can be released at once')
  ),
});

class ReleaseGradesConflictError extends Error {}

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can release grades.' },
      { status: 403 }
    );
  }

  const requestedSubmissionIds = Array.from(new Set(data.submissionIds));
  const teacherClassWhere = buildTeacherClassWhere(actor);

  let result:
    | { kind: 'not-found'; message: string }
    | { kind: 'disabled' }
    | {
        kind: 'success';
        releasedCount: number;
      };

  try {
    result = await prisma.$transaction(async (tx) => {
      // Verify all submissions exist and are eligible to be released.
      const submissions = await tx.submission.findMany({
        where: {
          id: { in: requestedSubmissionIds },
          document: {
            is: {
              membershipId: { not: actor.membershipId },
              AND: [
                { membership: { is: { userId: { not: actor.userId } } } },
                teacherClassWhere,
              ],
            },
          },
          ...(actor.isAdmin
            ? {}
            : { gradedByMembershipId: actor.membershipId }),
          releasedAt: null,
          // A student can unsubmit after a teacher's grade is saved but
          // before it's released. Exclude it from eligibility so it fails
          // the same way any other no-longer-eligible submission does.
          unsubmittedAt: null,
        },
        select: {
          id: true,
          updatedAt: true,
          releasedAt: true,
          numericPercentage: true,
          document: {
            select: {
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
                  userId: true,
                  organizationId: true,
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

      if (submissions.length === 0) {
        return {
          kind: 'not-found' as const,
          message: 'No unreleased submissions found.',
        };
      }

      if (submissions.length !== requestedSubmissionIds.length) {
        return {
          kind: 'not-found' as const,
          message:
            'One or more submissions are no longer eligible for release.',
        };
      }

      const now = new Date();

      // Release all submissions. Keep releasedAt null in the predicate so a
      // concurrent release cannot silently turn this into a partial success.
      const updateResult = await tx.submission.updateMany({
        where: {
          id: { in: submissions.map((s) => s.id) },
          OR: submissions.map((submission) => ({
            id: submission.id,
            updatedAt: submission.updatedAt,
          })),
          document: {
            is: {
              membershipId: { not: actor.membershipId },
              AND: [
                { membership: { is: { userId: { not: actor.userId } } } },
                teacherClassWhere,
              ],
            },
          },
          ...(actor.isAdmin
            ? {}
            : { gradedByMembershipId: actor.membershipId }),
          releasedAt: null,
          unsubmittedAt: null,
        },
        data: {
          releasedAt: now,
          updatedAt: now,
        },
      });

      if (updateResult.count !== submissions.length) {
        throw new ReleaseGradesConflictError();
      }

      await recordSubmissionActivities(
        tx,
        submissions.map((submission) => {
          const organizationId =
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
            eventType: submissionActivityEventTypes.gradeReleased,
            source: 'release-grades',
            occurredAfterRelease: false,
            changes: buildSubmissionActivityChanges({
              before: { releasedAt: submission.releasedAt },
              after: { releasedAt: now },
              fields: ['releasedAt'],
            }),
          };
        })
      );

      return { kind: 'success' as const, releasedCount: submissions.length };
    });
  } catch (error) {
    if (error instanceof ReleaseGradesConflictError) {
      return dataResponse(
        {
          success: false,
          message:
            'Submissions changed while releasing grades. Please refresh and try again.',
        },
        { status: 409 }
      );
    }
    throw error;
  }

  if (result.kind === 'not-found') {
    return dataResponse(
      { success: false, message: result.message },
      { status: 404 }
    );
  }

  const message =
    result.releasedCount === 1
      ? 'Grade released to student.'
      : `${result.releasedCount} grades released to students.`;

  // Fire-and-forget AGS passback for each released submission (dev/preview only)
  // Run outside the transaction; failures should not block release UX.
  try {
    const releasedSubs = await prisma.submission.findMany({
      where: { id: { in: requestedSubmissionIds } },
      select: { id: true, numericPercentage: true },
    });
    for (const s of releasedSubs) {
      if (typeof s.numericPercentage === 'number') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        maybePostGradeToBlackboard({ numericPercentage: s.numericPercentage });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Blackboard AGS passback (mock) on release failed', { err });
  }

  return dataResponse({
    success: true,
    message,
    releasedCount: result.releasedCount,
  });
}

