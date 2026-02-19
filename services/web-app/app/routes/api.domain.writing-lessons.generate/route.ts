import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { generateLesson } from '~/utils/writing-lessons/generateLesson.server';
import {
  WRITING_LESSON_TOPICS,
  type WritingLessonTopicKey,
} from '~/utils/writing-lessons/topics';

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);

  if (request.method !== 'POST') {
    return dataResponse(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  let body: { topic?: string; gradeLevel?: string; customFocus?: string };
  try {
    body = await request.json();
  } catch {
    return dataResponse(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { topic, gradeLevel, customFocus } = body;

  if (!topic || !gradeLevel) {
    return dataResponse(
      { error: 'topic and gradeLevel are required' },
      { status: 400 }
    );
  }

  if (!(topic in WRITING_LESSON_TOPICS)) {
    return dataResponse(
      { error: `Invalid topic: ${topic}` },
      { status: 400 }
    );
  }

  try {
    const content = await generateLesson({
      topic: topic as WritingLessonTopicKey,
      gradeLevel,
      customFocus: customFocus || undefined,
    });

    return dataResponse({ content });
  } catch (error) {
    console.error('Failed to generate writing lesson:', error);
    return dataResponse(
      { error: 'Failed to generate lesson. Please try again.' },
      { status: 500 }
    );
  }
}
