/**
 * Remembering how long a class meets (Brian's review, A2).
 *
 * The intake v2 card asks for a length per class and starts the slider unset
 * rather than on a guessed 50. Once the teacher has set it, it is real data,
 * so the next lesson for that class starts there.
 */
import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import { requireMutableRequest } from '~/utils/auth.server';
import { requireLessonPlannerAccess } from '~/utils/lesson-planner/lesson-planner-access.server';
import {
  LESSON_MINUTES_MAX,
  LESSON_MINUTES_MIN,
} from '~/domain/lesson-planner/lesson-ask';

const POST = z
  .object({
    classId: z.string().min(1),
    minutes: z.coerce
      .number()
      .int()
      .min(LESSON_MINUTES_MIN)
      .max(LESSON_MINUTES_MAX),
  })
  .strict();

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const access = await requireLessonPlannerAccess(request);

  const { error, data } = await parseFormData(request, POST);
  if (error) return validationError(error);

  const { count } = await prisma.class.updateMany({
    where: {
      id: data.classId,
      teachers: { some: { id: access.membership.id } },
    },
    data: { periodMinutes: data.minutes },
  });
  if (count === 0) {
    return dataResponse({ error: 'Class not found.' }, { status: 404 });
  }
  return dataResponse({ saved: true });
}
