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
  recordSubmissionActivity,
  resolveSubmissionActivityActorMembershipId,
  submissionActivityEventTypes,
} from '~/domain/submissions/submission-activity.server';

const POST = z.object({
  submissionIds: z.preprocess(
    (value) => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return [value];
      return value;
    },
    z.array(z.string()).min(1, 'At least one submission is required')
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
              ...teacherClassWhere,
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
          releasedAt: true,
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
          document: {
            is: {
              membershipId: { not: actor.membershipId },
              ...teacherClassWhere,
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

      for (const submission of submissions) {
        const organizationId =
          submission.document.membership?.organizationId ??
          actor.organizationId;
        await recordSubmissionActivity(tx, {
          submissionId: submission.id,
          organizationId,
          actorMembershipId: resolveSubmissionActivityActorMembershipId({
            actorMembershipId: actor.membershipId,
            actorOrganizationId: actor.organizationId,
            submissionOrganizationId: organizationId,
          }),
          eventType: submissionActivityEventTypes.gradeReleased,
          source: 'release-grades',
          occurredAfterRelease: false,
          changes: buildSubmissionActivityChanges({
            before: { releasedAt: submission.releasedAt },
            after: { releasedAt: now },
            fields: ['releasedAt'],
          }),
        });
      }

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

  return dataResponse({
    success: true,
    message,
    releasedCount: result.releasedCount,
  });
}
