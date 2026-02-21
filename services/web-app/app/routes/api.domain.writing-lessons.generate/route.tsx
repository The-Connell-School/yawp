import {
  type ActionFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { generateLesson } from '~/utils/writing-lessons/generateLesson.server';
import { WritingLessonTopic } from '@app/prisma';

const GenerateSchema = z.object({
  topic: z.nativeEnum(WritingLessonTopic),
  gradeLevel: z.enum(['middle-school', 'high-school', 'college']),
  customFocus: z.string().optional(),
  sourceDocumentId: z.string().optional(),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.teacherProfile) {
    return dataResponse(
      { error: 'Teacher profile required' },
      { status: 403 }
    );
  }

  const { error, data } = await parseFormData(request, GenerateSchema);
  if (error) return validationError(error);

  try {
    // TODO: Implement rate limiting here
    // Check if teacher has exceeded generation limit (e.g., 10 per hour)

    let sourceDocumentText: string | undefined;
    if (data.sourceDocumentId) {
      const { prisma } = await import('~/utils/db.server');
      const doc = await prisma.document.findUnique({
        where: { id: data.sourceDocumentId },
        select: { text: true },
      });
      sourceDocumentText = doc?.text ?? undefined;
    }

    const content = await generateLesson({
      topic: data.topic,
      gradeLevel: data.gradeLevel,
      customFocus: data.customFocus,
      sourceDocumentText,
    });

    return dataResponse({ content });
  } catch (err) {
    console.error('Failed to generate lesson:', err);
    return dataResponse(
      {
        error:
          'Failed to generate lesson. Please try again or contact support.',
      },
      { status: 500 }
    );
  }
}
