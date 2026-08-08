import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { getGradingActor } from '~/utils/grading-auth.server';

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
            is: { membershipId: actor.membershipId },
          },
        },
        select: { id: true, gradedAt: true, releasedAt: true },
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
        },
        data: {
          unsubmittedAt: now,
          unsubmittedByMembershipId: actor.membershipId,
        },
      });

      if (updateResult.count !== 1) {
        throw new UnsubmitConflictError();
      }

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
          'This submission can no longer be unsubmitted because it has been graded.',
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
