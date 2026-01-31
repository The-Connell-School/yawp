import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  gradeIds: z.preprocess(
    value => {
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') return [value];
      return value;
    },
    z.array(z.string()).min(1, 'At least one grade is required')
  ),
});

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
      { success: false, message: 'Only teachers can release grades.' },
      { status: 403 }
    );
  }

  // Verify all grades exist and were graded by this teacher
  const grades = await prisma.grade.findMany({
    where: {
      id: { in: data.gradeIds },
      gradedById: profile.id,
      releasedAt: null,
    },
    select: { id: true },
  });

  if (grades.length === 0) {
    return dataResponse(
      { success: false, message: 'No unreleased grades found.' },
      { status: 404 }
    );
  }

  const now = new Date();

  // Release all grades
  await prisma.grade.updateMany({
    where: {
      id: { in: grades.map(g => g.id) },
    },
    data: {
      releasedAt: now,
      updatedAt: now,
    },
  });

  const message =
    grades.length === 1
      ? 'Grade released to student.'
      : `${grades.length} grades released to students.`;

  return dataResponse({
    success: true,
    message,
    releasedCount: grades.length,
  });
}
