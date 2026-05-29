import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmissionEnabledForScope } from '~/utils/feature-flags.server';
import { getDocumentSubmissionScope } from '~/utils/document-submission-scope.server';
import { redirectWithToast } from '~/utils/toast.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

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
          document: { is: { profileId: { not: actor.profileId } } },
          ...(actor.isAdmin ? {} : { gradedById: actor.profileId }),
          releasedAt: null,
        },
        select: {
          id: true,
          document: {
            select: {
              assignment: {
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
              studentProfile: {
                select: {
                  classes: {
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

      const submissionScopeFlags = await Promise.all(
        submissions.map((submission) => {
          const scope = getDocumentSubmissionScope(submission.document);
          return isDocumentSubmissionEnabledForScope({
            ...scope,
            actorTeacherProfileId: actor.teacherProfileId,
          });
        })
      );
      if (submissionScopeFlags.some((enabled) => !enabled)) {
        return { kind: 'disabled' as const };
      }

      const now = new Date();

      // Release all submissions. Keep releasedAt null in the predicate so a
      // concurrent release cannot silently turn this into a partial success.
      const updateResult = await tx.submission.updateMany({
        where: {
          id: { in: submissions.map((s) => s.id) },
          releasedAt: null,
        },
        data: {
          releasedAt: now,
          updatedAt: now,
        },
      });

      if (updateResult.count !== submissions.length) {
        throw new ReleaseGradesConflictError();
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

  if (result.kind === 'disabled') {
    return redirectWithToast('/app/my-classes', {
      description:
        'Grade release is currently disabled for one or more schools.',
      type: 'error',
    });
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
