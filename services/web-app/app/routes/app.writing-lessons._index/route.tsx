import { ChevronRight, Plus, Zap } from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Tooltip } from '~/components/ui/tooltip';
import { WritingPracticeAssignmentSheet } from '~/components/writing-lessons/writing-practice-assignment-sheet';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  getQuickWritingLessonGroups,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  if (!membership.organization.writingPracticeEnabled) {
    throw redirect('/app');
  }

  const groups = getQuickWritingLessonGroups().map((group) => ({
    ...group,
    lessons: group.lessons.map((lesson) => ({
      ...lesson,
      promptCount: getQuickWritingPracticePrompts(lesson.slug).length,
    })),
  }));
  const lessonCount = groups.reduce(
    (count, group) => count + group.lessons.length,
    0
  );
  const promptCount = groups.reduce(
    (count, group) =>
      count +
      group.lessons.reduce(
        (lessonTotal, lesson) => lessonTotal + lesson.promptCount,
        0
      ),
    0
  );

  const isTeacher = membership.role === 'TEACHER';
  const teacherClasses = isTeacher
    ? await prisma.class.findMany({
        where: {
          teachers: { some: { id: membership.id } },
          isArchived: false,
        },
        orderBy: [{ title: 'asc' }, { grade: 'asc' }, { period: 'asc' }],
        select: { id: true, title: true, grade: true, period: true },
      })
    : [];

  return dataResponse({
    groups,
    lessonCount,
    promptCount,
    isTeacher,
    teacherClasses,
  });
}

export default function WritingLessonsIndexRoute() {
  const { groups, lessonCount, promptCount, isTeacher, teacherClasses } =
    useLoaderData<typeof loader>();
  const [lessonToAssign, setLessonToAssign] = useState<{
    slug: string;
    title: string;
  } | null>(null);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      {/* Hero */}
      <div className="relative overflow-hidden border-b bg-linear-to-br from-background via-background to-primary/5">
        <div className="mx-auto w-full max-w-screen-lg px-3 py-8 sm:px-5 sm:py-12">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Writing practice
          </h2>
          <p className="mt-3 max-w-xl text-pretty text-base text-muted-foreground sm:text-sm">
            Create and send lessons on grammar, syntax, and revision to hone
            your students' writing.
          </p>
          <div className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border sm:w-fit">
            <div className="flex flex-col gap-0.5 bg-popover px-4 py-3 sm:px-6">
              <p className="text-xl font-semibold tabular-nums">
                {lessonCount}
              </p>
              <p className="text-base text-muted-foreground sm:text-sm">
                Lessons
              </p>
            </div>
            <div className="flex flex-col gap-0.5 bg-popover px-4 py-3 sm:px-6">
              <p className="text-xl font-semibold tabular-nums">
                {promptCount}
              </p>
              <p className="text-base text-muted-foreground sm:text-sm">
                Prompts
              </p>
            </div>
            <div className="flex flex-col gap-0.5 bg-popover px-4 py-3 sm:px-6">
              <p className="text-xl font-semibold tabular-nums">
                {groups.length}
              </p>
              <p className="text-base text-muted-foreground sm:text-sm">
                Topics
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Flat lesson grid */}
      <div className="mx-auto w-full max-w-screen-lg px-3 py-8 pb-24 sm:px-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.flatMap((group) =>
            group.lessons.map((lesson) => (
              <div
                key={lesson.slug}
                data-testid={`writing-lesson-card-${lesson.slug}`}
                className="relative overflow-hidden rounded-xl border bg-popover shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              >
                <Link
                  to={`/app/writing-lessons/${lesson.slug}`}
                  className="flex h-full flex-col p-5"
                >
                  <p className="pr-9 font-mono text-[0.6rem] font-medium uppercase tracking-widest text-primary">
                    {group.category}
                  </p>
                  <p className="mt-1.5 pr-9 text-balance text-base font-semibold">
                    {lesson.title}
                  </p>
                  <p className="mt-1 text-pretty text-base text-muted-foreground sm:text-sm">
                    {lesson.description}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-base text-muted-foreground sm:text-sm">
                    <span className="inline-flex items-center gap-1">
                      <Zap className="size-3.5 shrink-0" />
                      {lesson.promptCount} prompts
                    </span>
                    <span className="inline-flex items-center gap-1 font-medium text-foreground">
                      Start
                      <ChevronRight className="size-4 shrink-0" />
                    </span>
                  </div>
                </Link>
                {isTeacher ? (
                  <Tooltip text={`New ${lesson.title} assignment`}>
                    <button
                      type="button"
                      onClick={() =>
                        setLessonToAssign({
                          slug: lesson.slug,
                          title: lesson.title,
                        })
                      }
                      aria-label={`New ${lesson.title} assignment`}
                      className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-full bg-background text-foreground shadow-sm ring-1 ring-black/10 transition-colors hover:bg-muted"
                    >
                      <Plus className="size-4" />
                      <span
                        className="pointer-fine:hidden absolute left-1/2 top-1/2 size-[max(100%,3rem)] -translate-x-1/2 -translate-y-1/2"
                        aria-hidden="true"
                      />
                    </button>
                  </Tooltip>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      {lessonToAssign ? (
        <WritingPracticeAssignmentSheet
          key={lessonToAssign.slug}
          lesson={lessonToAssign}
          teacherClasses={teacherClasses}
          onOpenChange={(open) => {
            if (!open) setLessonToAssign(null);
          }}
        />
      ) : null}
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
