import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { formatGrade, letterFromPercent } from '~/domain/grading/gradeMath';
import { isDocumentSubmissionEnabledForSchool } from '~/utils/feature-flags.server';
import { redirectWithToast } from '~/utils/toast.server';
import { canManageGrades, getGradingActor } from '~/utils/grading-auth.server';

const POST = z.object({
  gradeId: z.string(),
  score: z.string().optional(),
  feedback: z.string().optional(),
  rubricScores: z.string().optional(),
  overallScore: z.string().optional(),
  overallComment: z.string().optional(),
  numericPercentage: z.string().optional(),
  letterGrade: z.string().optional(),
  aiMeta: z.string().optional(),
});

function parseJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const actor = await getGradingActor(request);
  if (!canManageGrades(actor)) {
    return dataResponse(
      { success: false, message: 'Only teachers can update grades.' },
      { status: 403 }
    );
  }

  const grade = await prisma.grade.findFirst({
    where: {
      id: data.gradeId,
      ...(actor.isAdmin ? {} : { gradedById: actor.profileId }),
    },
    select: {
      id: true,
      releasedAt: true,
      snapshot: {
        select: {
          document: {
            select: {
              class: {
                select: {
                  schoolId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!grade) {
    return dataResponse(
      { success: false, message: 'Grade not found.' },
      { status: 404 }
    );
  }

  const isSubmissionEnabled = await isDocumentSubmissionEnabledForSchool(
    grade.snapshot.document.class?.schoolId
  );
  if (!isSubmissionEnabled) {
    return redirectWithToast('/app/my-classes', {
      description: 'Grading is currently disabled for this school.',
      type: 'error',
    });
  }

  // Update the grade
  const rubricScores = parseJson(data.rubricScores);
  const aiMeta = parseJson(data.aiMeta);
  const overallScore =
    data.overallScore && Number.isFinite(Number(data.overallScore))
      ? Number(data.overallScore)
      : null;
  const overallComment = data.overallComment ?? null;
  const numericPercentage =
    data.numericPercentage && Number.isFinite(Number(data.numericPercentage))
      ? Math.max(0, Math.min(100, Math.round(Number(data.numericPercentage))))
      : null;
  const letterGrade =
    numericPercentage !== null ? letterFromPercent(numericPercentage) : null;
  const score =
    data.score ??
    (numericPercentage !== null
      ? (formatGrade(numericPercentage, letterGrade) ?? undefined)
      : undefined);

  const updatedGrade = await prisma.grade.update({
    where: { id: grade.id },
    data: {
      score,
      feedback: data.feedback,
      rubricScores,
      overallScore,
      overallComment,
      numericPercentage,
      letterGrade,
      aiMeta,
      updatedAt: new Date(),
    },
  });

  return dataResponse({
    success: true,
    message: 'Grade updated successfully.',
    grade: updatedGrade,
  });
}
