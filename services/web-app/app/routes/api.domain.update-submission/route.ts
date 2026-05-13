import { type ActionFunctionArgs } from 'react-router';
import { prisma } from '~/utils/db.server';
import {
  canManageGrades,
  getGradingActor,
  isGradingOwnDocument,
} from '~/utils/grading-auth.server';

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

  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      document: {
        is: {
          deletedAt: null,
          ...(actor.isAdmin
            ? {}
            : {
                assignment: {
                  class: {
                    teachers: { some: { profileId: actor.profileId } },
                  },
                },
              }),
        },
      },
    },
    select: {
      id: true,
      gradedAt: true,
      gradedById: true,
      document: { select: { profileId: true } },
    },
  });

  if (!submission) {
    return Response.json(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  if (
    isGradingOwnDocument(actor.profileId, submission.document.profileId)
  ) {
    return Response.json(
      { success: false, message: 'You cannot grade your own submission.' },
      { status: 403 }
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
    releasedAt: (v) => (typeof v === 'string' ? new Date(v) : undefined),
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
  if (fields.markAsGraded && !submission.gradedAt) {
    data.gradedAt = new Date();
    data.gradedById = actor.profileId;
  }

  data.updatedAt = new Date();

  const updatedSubmission = await prisma.submission.update({
    where: { id: submission.id },
    data,
  });

  return Response.json({ success: true, submission: updatedSubmission });
}
