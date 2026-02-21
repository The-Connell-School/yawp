import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  data as dataResponse,
  redirect,
} from 'react-router';
import { Link, useLoaderData, useFetcher } from 'react-router';
import { parseFormData, validationError } from '@rvf/react-router';
import { z } from 'zod';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { evaluateExercise } from '~/utils/writing-lessons/evaluateExercise.server';
import { Exercise } from '~/utils/writing-lessons/topics';
import { Button } from '~/components/ui/button';
import { Textarea } from '~/components/ui/textarea';
import { ArrowLeft, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { FeedbackDisplay } from '~/components/writing-lessons/feedback-display';

const SubmitSchema = z.object({
  exerciseIndex: z.string().transform(Number),
  response: z.string().min(1, 'Response is required'),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    throw new Response('Student profile required', { status: 403 });
  }

  const topicParam = params.lessonId?.toUpperCase();
  if (!topicParam) {
    throw new Response('Topic required', { status: 400 });
  }

  const lesson = await prisma.writingLesson.findFirst({
    where: { topic: topicParam as any },
    orderBy: [{ isTemplate: 'desc' }, { createdAt: 'desc' }],
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  // Get or create session
  let session = await prisma.writingLessonSession.findUnique({
    where: {
      lessonId_studentProfileId: {
        lessonId: lesson.id,
        studentProfileId: profile.studentProfile.id,
      },
    },
    include: {
      attempts: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!session) {
    session = await prisma.writingLessonSession.create({
      data: {
        lessonId: lesson.id,
        studentProfileId: profile.studentProfile.id,
      },
      include: {
        attempts: true,
      },
    });
  }

  const exercises = lesson.exercises as Exercise[];

  // Calculate current exercise index
  const correctAttempts = new Set(
    session.attempts.filter((a) => a.isCorrect).map((a) => a.exerciseIndex)
  );
  const currentExerciseIndex =
    correctAttempts.size < exercises.length ? correctAttempts.size : exercises.length - 1;

  // Get attempts for current exercise
  const currentAttempts = session.attempts.filter(
    (a) => a.exerciseIndex === currentExerciseIndex
  );

  const isComplete = correctAttempts.size === exercises.length;

  return dataResponse({
    lesson: {
      id: lesson.id,
      topic: lesson.topic,
      title: lesson.title,
    },
    session: {
      id: session.id,
      completedAt: session.completedAt,
    },
    exercises,
    currentExerciseIndex,
    currentAttempts,
    isComplete,
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    throw new Response('Student profile required', { status: 403 });
  }

  const { error, data } = await parseFormData(request, SubmitSchema);
  if (error) return validationError(error);

  const topicParam = params.lessonId?.toUpperCase();
  const lesson = await prisma.writingLesson.findFirst({
    where: { topic: topicParam as any },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const session = await prisma.writingLessonSession.findUnique({
    where: {
      lessonId_studentProfileId: {
        lessonId: lesson.id,
        studentProfileId: profile.studentProfile.id,
      },
    },
    include: {
      attempts: {
        where: {
          exerciseIndex: data.exerciseIndex,
        },
      },
    },
  });

  if (!session) {
    throw new Response('Session not found', { status: 404 });
  }

  const exercises = lesson.exercises as Exercise[];
  const exercise = exercises[data.exerciseIndex];

  if (!exercise) {
    throw new Response('Exercise not found', { status: 404 });
  }

  // Evaluate the response
  const attemptNumber = session.attempts.length + 1;
  const evaluation = await evaluateExercise({
    topic: lesson.topic as any,
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

  return dataResponse({
    isCorrect: evaluation.isCorrect,
    feedback: evaluation.feedback,
    attemptNumber,
  });
}

export default function PracticeRoute() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [response, setResponse] = useState('');

  const currentExercise = data.exercises[data.currentExerciseIndex];
  const totalExercises = data.exercises.length;
  const exerciseNumber = data.currentExerciseIndex + 1;

  const isSubmitting = fetcher.state !== 'idle';
  const lastAttempt = data.currentAttempts[data.currentAttempts.length - 1];
  const showFeedback = fetcher.data || lastAttempt;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!response.trim() || isSubmitting) return;

    fetcher.submit(
      {
        exerciseIndex: data.currentExerciseIndex.toString(),
        response,
      },
      { method: 'POST' }
    );
  };

  // Auto-advance after correct answer
  const isCorrect = fetcher.data?.isCorrect || lastAttempt?.isCorrect;

  if (data.isComplete) {
    return (
      <div className="h-full w-full flex items-center justify-center p-5">
        <div className="max-w-md text-center space-y-6">
          <div className="rounded-full bg-green-500/10 w-20 h-20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
          </div>
          <h2 className="text-2xl font-bold">Lesson Complete!</h2>
          <p className="text-muted-foreground">
            Great work! You've successfully completed all {totalExercises} exercises.
          </p>
          <div className="flex gap-3 justify-center">
            <Link to={`/app/writing-lessons/${data.lesson.topic.toLowerCase()}`}>
              <Button variant="outline">Review Lesson</Button>
            </Link>
            <Link to="/app/writing-lessons">
              <Button>Browse More Lessons</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      {/* Header */}
      <div className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-5">
          <Link
            to={`/app/writing-lessons/${data.lesson.topic.toLowerCase()}`}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to lesson
          </Link>
          <h1 className="text-2xl font-bold">Practice Exercises</h1>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-2xl p-5 pb-24">
        {/* Progress */}
        <div className="mb-6 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Exercise {exerciseNumber} of {totalExercises}
            </span>
          </div>
          <div className="flex gap-1">
            {data.exercises.map((_, i) => (
              <div
                key={i}
                className={`h-2 flex-1 rounded-full ${
                  i < data.currentExerciseIndex
                    ? 'bg-primary'
                    : i === data.currentExerciseIndex
                      ? 'bg-primary/50'
                      : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Exercise */}
        <div className="space-y-6">
          <div className="rounded-lg border bg-card p-6">
            <div className="mb-6">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {currentExercise.instruction}
              </div>
              <div className="rounded bg-muted p-4 font-mono text-sm">
                {currentExercise.prompt}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  Your revision:
                </label>
                <Textarea
                  value={response}
                  onChange={(e) => setResponse(e.target.value)}
                  placeholder="Type your revised sentence here..."
                  className="min-h-[120px] font-mono"
                  disabled={isSubmitting || isCorrect}
                />
              </div>

              {!isCorrect ? (
                <Button
                  type="submit"
                  disabled={!response.trim() || isSubmitting}
                  className="w-full"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Check Answer
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => {
                    setResponse('');
                    window.location.reload();
                  }}
                  className="w-full gap-2"
                >
                  Next Exercise
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </form>
          </div>

          {/* Feedback */}
          {showFeedback && (
            <FeedbackDisplay
              isCorrect={
                fetcher.data?.isCorrect ?? lastAttempt?.isCorrect ?? false
              }
              feedback={fetcher.data?.feedback ?? lastAttempt?.feedback ?? ''}
              attemptNumber={
                fetcher.data?.attemptNumber ?? lastAttempt?.attemptNumber ?? 1
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
