import {
  type ActionFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { evaluateExercise } from '~/utils/writing-lessons/evaluateExercise.server';
import { Exercise } from '~/utils/writing-lessons/topics';

const EvaluateSchema = z.object({
  sessionId: z.string().cuid(),
  exerciseIndex: z.string().transform(Number),
  response: z.string().min(1, 'Response is required'),
});

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    return dataResponse(
      { error: 'Student profile required' },
      { status: 403 }
    );
  }

  const { error, data } = await parseFormData(request, EvaluateSchema);
  if (error) return validationError(error);

  try {
    // TODO: Implement rate limiting here
    // Check if student has exceeded evaluation limit (e.g., 50 per hour)

    // Fetch session and verify ownership
    const session = await prisma.writingLessonSession.findUnique({
      where: { id: data.sessionId },
      include: {
        lesson: true,
        attempts: {
          where: {
            exerciseIndex: data.exerciseIndex,
          },
        },
      },
    });

    if (!session) {
      return dataResponse({ error: 'Session not found' }, { status: 404 });
    }

    if (session.studentProfileId !== profile.studentProfile.id) {
      return dataResponse(
        { error: 'Not authorized to access this session' },
        { status: 403 }
      );
    }

    const exercises = session.lesson.exercises as Exercise[];
    const exercise = exercises[data.exerciseIndex];

    if (!exercise) {
      return dataResponse({ error: 'Exercise not found' }, { status: 404 });
    }

    // Calculate attempt number
    const attemptNumber = session.attempts.length + 1;

    // Evaluate the response
    const evaluation = await evaluateExercise({
      topic: session.lesson.topic as any,
      exercisePrompt: exercise.prompt,
      instruction: exercise.instruction,
      studentResponse: data.response,
      attemptNumber,
    });

    // Create attempt record
    await prisma.writingLessonAttempt.create({
      data: {
        sessionId: session.id,
        exerciseIndex: data.exerciseIndex,
        response: data.response,
        isCorrect: evaluation.isCorrect,
        feedback: evaluation.feedback,
        attemptNumber,
      },
    });

    // Check if all exercises are complete
    if (evaluation.isCorrect) {
      const allAttempts = await prisma.writingLessonAttempt.findMany({
        where: { sessionId: session.id },
      });

      const correctExercises = new Set(
        allAttempts.filter((a) => a.isCorrect).map((a) => a.exerciseIndex)
      );

      if (correctExercises.size === exercises.length && !session.completedAt) {
        await prisma.writingLessonSession.update({
          where: { id: session.id },
          data: { completedAt: new Date() },
        });
      }
    }

    return dataResponse({
      isCorrect: evaluation.isCorrect,
      feedback: evaluation.feedback,
      attemptNumber,
    });
  } catch (err) {
    console.error('Failed to evaluate exercise:', err);
    return dataResponse(
      {
        error: 'Failed to evaluate your response. Please try again.',
        isCorrect: false,
        feedback:
          'Unable to evaluate your response right now. Please try again or ask your teacher for help.',
      },
      { status: 500 }
    );
  }
}
