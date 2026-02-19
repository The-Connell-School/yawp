import { useState } from 'react';
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useFetcher, useLoaderData } from 'react-router';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  PartyPopper,
  Send,
} from 'lucide-react';
import { z } from 'zod';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Progress } from '~/components/ui/progress';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { cn } from '~/utils/misc';
import { evaluateExercise } from '~/utils/writing-lessons/evaluateExercise.server';
import { WRITING_LESSON_TOPICS } from '~/utils/writing-lessons/topics';

const SubmissionSchema = z.object({
  exerciseIndex: z.coerce.number().int().min(0),
  response: z.string().min(1, 'Please write a response'),
});

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    throw new Response('Student profile required', { status: 403 });
  }

  const studentProfileId = profile.studentProfile.id;

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: {
      id: true,
      topic: true,
      title: true,
      exercises: true,
    },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const session = await prisma.writingLessonSession.upsert({
    where: {
      lessonId_studentProfileId: {
        lessonId: lesson.id,
        studentProfileId,
      },
    },
    create: {
      lessonId: lesson.id,
      studentProfileId,
    },
    update: {},
    select: {
      id: true,
      completedAt: true,
    },
  });

  const attempts = await prisma.writingLessonAttempt.findMany({
    where: { sessionId: session.id },
    select: {
      id: true,
      exerciseIndex: true,
      response: true,
      isCorrect: true,
      feedback: true,
      attemptNumber: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return dataResponse({ lesson, session, attempts });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  if (!profile.studentProfile) {
    throw new Response('Student profile required', { status: 403 });
  }

  const studentProfileId = profile.studentProfile.id;

  const formData = await request.formData();
  const parsed = SubmissionSchema.safeParse({
    exerciseIndex: formData.get('exerciseIndex'),
    response: formData.get('response'),
  });

  if (!parsed.success) {
    return dataResponse(
      { success: false, error: 'Invalid submission', feedback: null },
      { status: 400 }
    );
  }

  const { exerciseIndex, response } = parsed.data;

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: {
      id: true,
      topic: true,
      title: true,
      exercises: true,
    },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const exercises = lesson.exercises as Array<{
    prompt: string;
    instruction: string;
  }>;

  if (exerciseIndex < 0 || exerciseIndex >= exercises.length) {
    return dataResponse(
      { success: false, error: 'Invalid exercise index', feedback: null },
      { status: 400 }
    );
  }

  const exercise = exercises[exerciseIndex];
  const topicDef =
    WRITING_LESSON_TOPICS[
      lesson.topic as keyof typeof WRITING_LESSON_TOPICS
    ];

  const session = await prisma.writingLessonSession.upsert({
    where: {
      lessonId_studentProfileId: {
        lessonId: lesson.id,
        studentProfileId,
      },
    },
    create: {
      lessonId: lesson.id,
      studentProfileId,
    },
    update: {},
  });

  const previousAttempts = await prisma.writingLessonAttempt.count({
    where: {
      sessionId: session.id,
      exerciseIndex,
    },
  });

  const attemptNumber = previousAttempts + 1;

  const evaluation = await evaluateExercise({
    topic: topicDef.name,
    exercisePrompt: exercise.prompt,
    instruction: exercise.instruction,
    studentResponse: response,
    attemptNumber,
  });

  await prisma.writingLessonAttempt.create({
    data: {
      sessionId: session.id,
      exerciseIndex,
      response,
      isCorrect: evaluation.isCorrect,
      feedback: evaluation.feedback,
      attemptNumber,
    },
  });

  if (evaluation.isCorrect) {
    const correctExerciseIndices = await prisma.writingLessonAttempt.findMany(
      {
        where: {
          sessionId: session.id,
          isCorrect: true,
        },
        select: { exerciseIndex: true },
        distinct: ['exerciseIndex'],
      }
    );

    const uniqueCorrectCount = correctExerciseIndices.length;

    if (uniqueCorrectCount >= exercises.length && !session.completedAt) {
      await prisma.writingLessonSession.update({
        where: { id: session.id },
        data: { completedAt: new Date() },
      });
    }
  }

  return dataResponse({
    success: true,
    error: null,
    feedback: {
      isCorrect: evaluation.isCorrect,
      feedback: evaluation.feedback,
      attemptNumber,
      exerciseIndex,
    },
  });
}

interface Exercise {
  prompt: string;
  instruction: string;
}

interface Attempt {
  id: string;
  exerciseIndex: number;
  response: string;
  isCorrect: boolean;
  feedback: string;
  attemptNumber: number;
  createdAt: string;
}

function ExerciseCard({
  exercise,
  exerciseIndex,
  attempts,
  totalExercises,
  onCorrect,
}: {
  exercise: Exercise;
  exerciseIndex: number;
  attempts: Attempt[];
  totalExercises: number;
  onCorrect: () => void;
}) {
  const [responseText, setResponseText] = useState('');
  const fetcher = useFetcher<typeof action>();

  const isSubmitting = fetcher.state !== 'idle';
  const actionData = fetcher.data;
  const isCorrect = attempts.some((a) => a.isCorrect);

  const latestFeedback =
    actionData?.feedback?.exerciseIndex === exerciseIndex
      ? actionData.feedback
      : null;

  if (latestFeedback?.isCorrect && !isCorrect) {
    onCorrect();
  }

  const feedbackToShow = latestFeedback ?? (
    attempts.length > 0
      ? {
          isCorrect: attempts[attempts.length - 1].isCorrect,
          feedback: attempts[attempts.length - 1].feedback,
          attemptNumber: attempts[attempts.length - 1].attemptNumber,
        }
      : null
  );

  const alreadyCorrect = isCorrect || latestFeedback?.isCorrect;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            Exercise {exerciseIndex + 1} of {totalExercises}
          </CardTitle>
          {alreadyCorrect && (
            <Badge variant="success" size="sm">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              Correct
            </Badge>
          )}
        </div>
        <CardDescription className="text-base">
          {exercise.instruction}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/50 p-4">
          <p className="text-sm font-medium text-muted-foreground">
            Original sentence:
          </p>
          <p className="mt-1">{exercise.prompt}</p>
        </div>

        {feedbackToShow && (
          <div
            className={cn(
              'rounded-md border p-4',
              feedbackToShow.isCorrect
                ? 'border-green-300 bg-green-50 text-green-900'
                : 'border-yellow-300 bg-yellow-50 text-yellow-900'
            )}
          >
            <p className="text-sm">{feedbackToShow.feedback}</p>
          </div>
        )}

        {!alreadyCorrect && (
          <fetcher.Form method="post">
            <input
              type="hidden"
              name="exerciseIndex"
              value={exerciseIndex}
            />
            <div className="space-y-3">
              <textarea
                name="response"
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder="Write your revised sentence here..."
                className="w-full resize-none rounded-md border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                rows={3}
                disabled={isSubmitting}
              />
              <Button
                type="submit"
                disabled={isSubmitting || !responseText.trim()}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Submit
                  </>
                )}
              </Button>
            </div>
          </fetcher.Form>
        )}

        {attempts.length > 0 && !alreadyCorrect && (
          <p className="text-xs text-muted-foreground">
            {attempts.length}{' '}
            {attempts.length === 1 ? 'attempt' : 'attempts'} so far
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function WritingLessonPracticeRoute() {
  const { lesson, session, attempts } = useLoaderData<typeof loader>();

  const exercises = lesson.exercises as Exercise[];
  const [currentIndex, setCurrentIndex] = useState(() => {
    const correctIndices = new Set(
      attempts.filter((a) => a.isCorrect).map((a) => a.exerciseIndex)
    );
    for (let i = 0; i < exercises.length; i++) {
      if (!correctIndices.has(i)) return i;
    }
    return exercises.length - 1;
  });

  const [localCorrect, setLocalCorrect] = useState<Set<number>>(() => {
    return new Set(
      attempts.filter((a) => a.isCorrect).map((a) => a.exerciseIndex)
    );
  });

  const correctCount = localCorrect.size;
  const isAllComplete =
    correctCount >= exercises.length || session.completedAt !== null;

  const currentExerciseAttempts = attempts.filter(
    (a) => a.exerciseIndex === currentIndex
  );

  const handleCorrect = () => {
    setLocalCorrect((prev) => new Set([...prev, currentIndex]));
  };

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
        <div className="mb-6 flex items-center justify-between">
          <Button asChild variant="outline" size="sm">
            <Link to={`/app/writing-lessons/${lesson.id}`}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to lesson
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            {lesson.title}
          </span>
        </div>

        <div className="mb-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-medium">Practice Progress</span>
            <span className="text-muted-foreground">
              {correctCount} of {exercises.length} complete
            </span>
          </div>
          <Progress
            value={correctCount}
            max={exercises.length}
          />
        </div>

        {isAllComplete ? (
          <Card className="border-green-300 bg-green-50/50">
            <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
              <PartyPopper className="h-12 w-12 text-green-600" />
              <h2 className="text-2xl font-bold text-green-900">
                All exercises complete!
              </h2>
              <p className="max-w-md text-green-800">
                Great work! You have completed all the practice exercises
                for this lesson. Keep writing and applying what you
                learned.
              </p>
              <div className="mt-4 flex gap-3">
                <Button asChild variant="outline">
                  <Link to="/app/writing-lessons">
                    <ArrowLeft className="mr-1 h-4 w-4" />
                    All Lessons
                  </Link>
                </Button>
                <Button asChild>
                  <Link to={`/app/writing-lessons/${lesson.id}`}>
                    Review Lesson
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              {exercises.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentIndex(idx)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors',
                    idx === currentIndex
                      ? 'bg-primary text-primary-foreground'
                      : localCorrect.has(idx)
                        ? 'bg-green-100 text-green-900'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  )}
                >
                  {localCorrect.has(idx) ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    idx + 1
                  )}
                </button>
              ))}
            </div>

            <ExerciseCard
              key={currentIndex}
              exercise={exercises[currentIndex]}
              exerciseIndex={currentIndex}
              attempts={currentExerciseAttempts}
              totalExercises={exercises.length}
              onCorrect={handleCorrect}
            />

            {localCorrect.has(currentIndex) && (
              <div className="mt-4 flex justify-end">
                <Button
                  onClick={() => {
                    for (let i = 0; i < exercises.length; i++) {
                      const nextIdx =
                        (currentIndex + 1 + i) % exercises.length;
                      if (!localCorrect.has(nextIdx)) {
                        setCurrentIndex(nextIdx);
                        return;
                      }
                    }
                  }}
                >
                  Next Exercise
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}

        <div className="pb-12" />
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
