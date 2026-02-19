import {
  type LoaderFunctionArgs,
  data as dataResponse,
} from 'react-router';
import { Link, useLoaderData } from 'react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  await requireUserId(request);

  const lesson = await prisma.writingLesson.findUnique({
    where: { id: params.lessonId },
    select: {
      id: true,
      topic: true,
      title: true,
      gradeLevel: true,
      content: true,
      exercises: true,
    },
  });

  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  return dataResponse({ lesson });
}

function LessonContent({ content }: { content: string }) {
  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert sm:prose-base"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}

export default function WritingLessonRoute() {
  const { lesson } = useLoaderData<typeof loader>();

  const exercises = lesson.exercises as Array<{
    prompt: string;
    instruction: string;
  }>;

  return (
    <div className="no-scrollbar h-full w-full overflow-y-scroll">
      <div className="mx-auto flex h-full w-full max-w-screen-md flex-col p-3 sm:p-5">
        <div className="mb-6">
          <Button asChild variant="outline">
            <Link to="/app/writing-lessons" className="w-fit">
              <ArrowLeft className="mr-1 h-4 w-4" /> Back to lessons
            </Link>
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="text-3xl font-bold">{lesson.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {lesson.gradeLevel.replace('-', ' ')} level
          </p>
        </div>

        <div className="mb-10">
          <LessonContent content={lesson.content} />
        </div>

        <div className="border-t pt-6 pb-12">
          <div className="flex flex-col items-center gap-4 text-center">
            <h3 className="text-xl font-semibold">Ready to practice?</h3>
            <p className="max-w-md text-muted-foreground">
              Put what you just learned into practice with{' '}
              {exercises.length} interactive{' '}
              {exercises.length === 1 ? 'exercise' : 'exercises'}.
            </p>
            <Button asChild size="lg">
              <Link to={`/app/writing-lessons/${lesson.id}/practice`}>
                Start Practice{' '}
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
