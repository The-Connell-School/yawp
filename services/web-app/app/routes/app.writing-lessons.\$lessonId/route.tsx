import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { parseLesson } from '~/utils/writing-lessons/parseLesson';
import { WRITING_LESSON_TOPICS } from '~/utils/writing-lessons/topics';
import { LessonContent } from '~/components/writing-lessons/lesson-content';
import { Button } from '~/components/ui/button';
import { ArrowLeft, PlayCircle, CheckCircle2 } from 'lucide-react';

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

  // Find a lesson for this topic (prefer assigned, then templates, then any)
  const lesson = await prisma.writingLesson.findFirst({
    where: {
      topic: topicParam as any,
    },
    orderBy: [{ isTemplate: 'desc' }, { createdAt: 'desc' }],
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  // Check if student has started this lesson
  const session = await prisma.writingLessonSession.findUnique({
    where: {
      lessonId_studentProfileId: {
        lessonId: lesson.id,
        studentProfileId: profile.studentProfile.id,
      },
    },
    include: {
      attempts: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  const parsed = parseLesson(lesson.content);

  return dataResponse({
    lesson: {
      id: lesson.id,
      topic: lesson.topic,
      title: lesson.title,
      gradeLevel: lesson.gradeLevel,
    },
    parsed,
    session: session
      ? {
          id: session.id,
          completedAt: session.completedAt,
          progress: {
            completed: session.attempts.filter((a) => a.isCorrect).length,
            total: (lesson.exercises as any[]).length,
          },
        }
      : null,
  });
}

export default function LessonView() {
  const { lesson, parsed, session } = useLoaderData<typeof loader>();
  const topicInfo = WRITING_LESSON_TOPICS[lesson.topic];

  const canStartPractice = !session?.completedAt;

  return (
    <div className="h-full w-full overflow-y-auto">
      {/* Header */}
      <div className="border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-5">
          <Link
            to="/app/writing-lessons"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to all lessons
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-2">{topicInfo.name}</h1>
              <p className="text-muted-foreground">{topicInfo.description}</p>
            </div>

            {session?.completedAt && (
              <div className="flex items-center gap-2 rounded-lg bg-green-500/10 px-4 py-2 text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">Completed</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-screen-lg p-5 pb-24">
        <LessonContent lesson={parsed} />

        {/* Practice Button */}
        <div className="mt-8 flex items-center justify-center">
          {canStartPractice ? (
            <Link to={`/app/writing-lessons/${lesson.topic.toLowerCase()}/practice`}>
              <Button size="lg" className="gap-2">
                <PlayCircle className="h-5 w-5" />
                {session ? 'Continue Practice' : 'Start Practice'}
              </Button>
            </Link>
          ) : (
            <div className="text-center">
              <div className="text-green-600 dark:text-green-400 font-medium mb-2">
                ✓ You've completed this lesson!
              </div>
              <Link to={`/app/writing-lessons/${lesson.topic.toLowerCase()}/practice`}>
                <Button variant="outline" size="sm">
                  Practice Again
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {session && !session.completedAt && (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Progress: {session.progress.completed} of {session.progress.total}{' '}
            exercises completed
          </div>
        )}
      </div>
    </div>
  );
}
