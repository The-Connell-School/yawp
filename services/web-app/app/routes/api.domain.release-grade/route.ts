import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const POST = z.object({
  gradeId: z.string(),
  isReleased: z.boolean(),
});

export async function action({ request }: ActionFunctionArgs) {
  try {
    const userId = await requireUserId(request);
    const profile = await requireProfile(request, userId);

    // Only teachers can release grades
    if (!profile.teacherProfile) {
      return dataResponse(
        { error: 'Only teachers can release grades' },
        { status: 403 }
      );
    }

    const { error, data } = await parseFormData(request, POST);
    if (error) return validationError(error);

    // Update grade release status
    const grade = await prisma.documentGrade.update({
      where: { id: data.gradeId },
      data: { isReleased: data.isReleased },
    });

    return dataResponse({
      success: true,
      grade: {
        id: grade.id,
        isReleased: grade.isReleased,
      },
    });
  } catch (error) {
    console.error('Error releasing grade:', error);
    return dataResponse(
      { error: 'An error occurred while releasing the grade' },
      { status: 500 }
    );
  }
}
