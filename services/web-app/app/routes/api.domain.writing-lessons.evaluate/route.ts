import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { requireUserId } from '~/utils/auth.server';
import { evaluateExercise } from '~/utils/writing-lessons/evaluateExercise.server';

export async function action({ request }: ActionFunctionArgs) {
  await requireUserId(request);

  if (request.method !== 'POST') {
    return dataResponse(
      { error: 'Method not allowed' },
      { status: 405 }
    );
  }

  let body: {
    topic?: string;
    exercisePrompt?: string;
    instruction?: string;
    studentResponse?: string;
    attemptNumber?: number;
  };
  try {
    body = await request.json();
  } catch {
    return dataResponse(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { topic, exercisePrompt, instruction, studentResponse, attemptNumber } =
    body;

  if (
    !topic ||
    !exercisePrompt ||
    !instruction ||
    !studentResponse ||
    attemptNumber === undefined
  ) {
    return dataResponse(
      {
        error:
          'topic, exercisePrompt, instruction, studentResponse, and attemptNumber are all required',
      },
      { status: 400 }
    );
  }

  if (typeof attemptNumber !== 'number' || attemptNumber < 1) {
    return dataResponse(
      { error: 'attemptNumber must be a positive integer' },
      { status: 400 }
    );
  }

  try {
    const result = await evaluateExercise({
      topic,
      exercisePrompt,
      instruction,
      studentResponse,
      attemptNumber,
    });

    return dataResponse(result);
  } catch (error) {
    console.error('Failed to evaluate exercise:', error);
    return dataResponse(
      {
        isCorrect: false,
        feedback:
          "We couldn't evaluate your response right now. Please try again.",
      },
      { status: 500 }
    );
  }
}
