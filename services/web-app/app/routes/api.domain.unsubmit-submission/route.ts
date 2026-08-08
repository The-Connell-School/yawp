import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import {
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';

const POST = z.object({ submissionId: z.string().min(1) });

class UnsubmitConflictError extends Error {}

/**
 * Teacher-initiated "unsubmit": marks a submission as withdrawn without
 * deleting the row. Only Submission.unsubmittedAt/unsubmittedByMembershipId
 * are written — the grade, AI feedback, comments, and grading assistant
 * runs already on the submission are left exactly as they are, and the
 * underlying Document / DocumentRevision rows are never touched by this
 * action, so the student's document and its revision history survive
 * untouched. Once unsubmitted, this submission stops counting as "active"
 * everywhere active submissions are read (teacher grading queues, the
 * student dashboard, the document editor's locked/submitted state), which
 * is what lets the student resubmit.
 */
export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can unsubmit a document.' },
      { status: 403 }
    );
  }

  let result:
    | { kind: 'not-found' }
    | { kind: 'success' };

  try {
    result = await prisma.$transaction(async (tx) => {
      const submission = await tx.submission.findFirst({
        where: {
          id: data.submissionId,
          unsubmittedAt: null,
          document: {
            is: {
              membershipId: { not: actor.membershipId },
              ...(actor.isAdmin
                ? {}
                : {
                    classAssignment: {
                      class: { teachers: { some: { id: actor.membershipId } } },
                    },
                  }),
            },
          },
        },
        select: { id: true, document: { select: { membershipId: true } } },
      });

      if (!submission) {
        return { kind: 'not-found' as const };
      }

      if (isGradingOwnDocument(actor.membershipId, submission.document.membershipId)) {
        return { kind: 'not-found' as const };
      }

      const now = new Date();

      // Keep unsubmittedAt: null in the predicate so a concurrent unsubmit
      // (e.g. two teacher tabs) cannot silently double-write.
      const updateResult = await tx.submission.updateMany({
        where: { id: submission.id, unsubmittedAt: null },
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

  return dataResponse({
    success: true,
    message:
      "Submission removed. The student's document was not deleted and can be resubmitted.",
  });
}
