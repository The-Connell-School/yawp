import { ArrowLeft } from 'lucide-react';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { isWritingPracticeEnabledForOrganization } from '~/utils/feature-gates.server';
import { getQuickWritingLessonBySlug } from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);
  const enabled = await isWritingPracticeEnabledForOrganization(
    profile.organization.id
  );

  if (!enabled) {
    return redirect('/app');
  }

  const lesson = getQuickWritingLessonBySlug(params.lessonSlug);
  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  return dataResponse({ lesson });
}

export default function WritingLessonDetailRoute() {
  const { lesson } = useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-md p-3 sm:p-5">
          <Button asChild variant="outline" size="sm" className="mb-5">
            <Link to="/app/writing-lessons">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to lessons
            </Link>
          </Button>
          <div className="flex flex-col">
            <p className="text-sm font-medium text-muted-foreground">
              {lesson.category}
            </p>
            <h2 className="mt-1">{lesson.title}</h2>
            <p className="mt-3 max-w-full text-muted-foreground sm:max-w-[560px]">
              {lesson.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-md px-3 py-6 pb-24 sm:px-5">
        <MarkdownLesson content={lesson.content} />
      </div>
    </section>
  );
}

function MarkdownLesson({ content }: { content: string }) {
  return (
    <article className="flex flex-col gap-3 text-base leading-7">
      {content.split('\n').map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-2" />;
        if (line === '---') return <hr key={index} className="my-3" />;
        if (line.startsWith('# ')) {
          return (
            <h3 key={index} className="mt-2 text-2xl font-semibold">
              {cleanMarkdown(line.slice(2))}
            </h3>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h4 key={index} className="mt-6 text-xl font-semibold">
              {cleanMarkdown(line.slice(3))}
            </h4>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h5 key={index} className="mt-4 text-lg font-semibold">
              {cleanMarkdown(line.slice(4))}
            </h5>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <p key={index} className="pl-4">
              <span aria-hidden="true">• </span>
              {cleanMarkdown(line.slice(2))}
            </p>
          );
        }

        return <p key={index}>{cleanMarkdown(line)}</p>;
      })}
    </article>
  );
}

function cleanMarkdown(value: string) {
  return value.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '');
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
