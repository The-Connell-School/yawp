import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  gradeId: z.string(),
  score: z.string().optional(),
  feedback: z.string().optional(),
  rubricScores: z.string().optional(),
  overallScore: z.string().optional(),
  overallComment: z.string().optional(),
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
  const userId = await requireUserId(request);
  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  // Get teacher's profile
  const profile = await prisma.profile.findFirst({
    where: {
      userId,
      teacherProfile: { isNot: null },
    },
    select: { id: true },
  });

  if (!profile) {
    return dataResponse(
      { success: false, message: 'Only teachers can update grades.' },
      { status: 403 }
    );
  }

  // Verify the grade exists and was graded by this teacher
  const grade = await prisma.grade.findFirst({
    where: {
      id: data.gradeId,
      gradedById: profile.id,
    },
    select: {
      id: true,
      releasedAt: true,
    },
  });

  if (!grade) {
    return dataResponse(
      { success: false, message: 'Grade not found.' },
      { status: 404 }
    );
  }

  // Update the grade
  const rubricScores = parseJson(data.rubricScores);
  const aiMeta = parseJson(data.aiMeta);
  const overallScore =
    data.overallScore && Number.isFinite(Number(data.overallScore))
      ? Number(data.overallScore)
      : null;
  const overallComment = data.overallComment ?? null;

  const updatedGrade = await prisma.grade.update({
    where: { id: grade.id },
    data: {
      score: data.score,
      feedback: data.feedback,
      rubricScores,
      overallScore,
      overallComment,
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
