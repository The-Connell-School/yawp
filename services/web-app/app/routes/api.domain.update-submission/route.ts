import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

const POST = z.object({
  submissionId: z.string(),
  score: z.string().optional(),
  feedback: z.string().optional(),
  rubricScores: z.string().optional(),
  overallScore: z.string().optional(),
  overallComment: z.string().optional(),
  numericPercentage: z.string().optional(),
  letterGrade: z.string().optional(),
  aiMeta: z.string().optional(),
  grammarIssues: z.string().optional(),
  promptConfig: z.string().optional(),
});

function parseJson(value?: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can update submissions.' },
      { status: 403 }
    );
  }

  const submission = await prisma.submission.findFirst({
    where: {
      id: data.submissionId,
      ...(actor.isAdmin
        ? {}
        : {
            document: {
              class: {
                teachers: { some: { profileId: actor.profileId } },
              },
            },
          }),
    },
    select: {
      id: true,
      gradedAt: true,
      gradedById: true,
      document: {
        select: { class: { select: { schoolId: true } } },
      },
    },
  });

  if (!submission) {
    return dataResponse(
      { success: false, message: 'Submission not found.' },
      { status: 404 }
    );
  }

  const isEnabled = await isDocumentSubmissionEnabledForSchool(
    submission.document.class?.schoolId
  );
  if (!isEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled for this school.',
      type: 'error',
    });
  }

  const rubricScores = parseJson(data.rubricScores);
  const aiMeta = parseJson(data.aiMeta);
  const grammarIssues = parseJson(data.grammarIssues);
  const promptConfig = parseJson(data.promptConfig);
  const overallScore =
    data.overallScore && Number.isFinite(Number(data.overallScore))
      ? Number(data.overallScore)
      : undefined;
  const overallComment = data.overallComment;
  const numericPercentage =
    data.numericPercentage && Number.isFinite(Number(data.numericPercentage))
      ? Math.max(0, Math.min(100, Math.round(Number(data.numericPercentage))))
      : undefined;
  const letterGrade =
    numericPercentage !== undefined
      ? letterFromPercent(numericPercentage)
      : undefined;
  const score =
    data.score ??
    (numericPercentage !== undefined
      ? (formatGrade(numericPercentage, letterGrade ?? null) ?? undefined)
      : undefined);

  const now = new Date();

  // Set gradedAt/gradedById only on first grading touch
  const isFirstGrade = !submission.gradedAt;
  const gradingFields = isFirstGrade
    ? { gradedAt: now, gradedById: actor.profileId }
    : {};

  const updatedSubmission = await prisma.submission.update({
    where: { id: submission.id },
    data: {
      ...gradingFields,
      ...(score !== undefined ? { score } : {}),
      ...(data.feedback !== undefined ? { feedback: data.feedback } : {}),
      ...(rubricScores !== undefined ? { rubricScores } : {}),
      ...(overallScore !== undefined ? { overallScore } : {}),
      ...(overallComment !== undefined ? { overallComment } : {}),
      ...(numericPercentage !== undefined ? { numericPercentage } : {}),
      ...(letterGrade !== undefined ? { letterGrade } : {}),
      ...(aiMeta !== undefined ? { aiMeta } : {}),
      ...(grammarIssues !== undefined ? { grammarIssues } : {}),
      ...(promptConfig !== undefined ? { promptConfig } : {}),
      updatedAt: now,
    },
  });

  return dataResponse({
    success: true,
    message: 'Submission updated.',
    submission: updatedSubmission,
  });
}
