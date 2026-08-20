import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Plus,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '~/components/ui/collapsible';
import { Tooltip } from '~/components/ui/tooltip';
import { WritingPracticeAssignmentSheet } from '~/components/writing-lessons/writing-practice-assignment-sheet';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { formatClassLabel } from '~/utils/class-display';
import { formatDateOnly } from '~/utils/date-only';
import { prisma } from '~/utils/db.server';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';
import {
  resolveTeacherSchoolYearScope,
  schoolYearWhere,
} from '~/utils/school-year-scope.server';
import {
  listWritingPracticeAssignmentsForStudent,
  listWritingPracticeAssignmentsForTeacher,
  type WritingPracticeAssignmentSummary,
} from '~/utils/writing-lessons/practice-assignments.server';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonSections,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

function toAssignmentCard(assignment: WritingPracticeAssignmentSummary) {
  return {
    id: assignment.id,
    title: assignment.title,
    problemCount: assignment.problemCount,
    dueAt: formatDateOnly(assignment.dueAt),
    instructions: assignment.instructions,
    lessons: assignment.lessonSlugs.map((slug) => ({
      slug,
      title: getQuickWritingLessonBySlug(slug)?.title ?? slug,
    })),
    classes: assignment.classes.map((klass) => ({
      id: klass.id,
      label: formatClassLabel(klass),
      classAssignmentId: klass.classAssignmentId,
    })),
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  if (!membership.organization.writingPracticeEnabled) {
    throw redirect('/app');
  }

  // Composition is behind its rollout flag; hide the whole section until on.
  const compositionEnabled = isCompositionPracticeEnabled();
  const sections = getQuickWritingLessonSections()
    .filter(
      (section) => compositionEnabled || section.section !== 'Composition'
    )
    .map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        lessons: group.lessons.map((lesson) => ({
          ...lesson,
          promptCount: getQuickWritingPracticePrompts(lesson.slug).length,
        })),
      })),
    }));

  const allLessons = sections
    .flatMap((section) => section.groups)
    .flatMap((group) => group.lessons);
  const lessonCount = allLessons.length;
  const promptCount = allLessons.reduce(
    (total, lesson) => total + lesson.promptCount,
    0
  );
  const topicCount = sections.reduce(
    (total, section) => total + section.groups.length,
    0
  );

  const isTeacher = membership.role === 'TEACHER';
  const teacherClasses = isTeacher
    ? await prisma.class.findMany({
        where: {
          teachers: { some: { id: membership.id } },
          isArchived: false,
          ...schoolYearWhere(
            await resolveTeacherSchoolYearScope(request, membership.id)
          ),
        },
        orderBy: [{ title: 'asc' }, { grade: 'asc' }, { period: 'asc' }],
        select: { id: true, title: true, grade: true, period: true },
      })
    : [];

  const assignments = (
    isTeacher
      ? await listWritingPracticeAssignmentsForTeacher(membership.id)
      : await listWritingPracticeAssignmentsForStudent(membership.id)
  ).map(toAssignmentCard);

  return dataResponse({
    sections,
    lessonCount,
    promptCount,
    topicCount,
    isTeacher,
    teacherClasses,
    assignments,
  });
}

export default function WritingLessonsIndexRoute() {
  const {
    sections,
    lessonCount,
    promptCount,
    topicCount,
    isTeacher,
    teacherClasses,
    assignments,
  } = useLoaderData<typeof loader>();
  const [lessonToAssign, setLessonToAssign] = useState<{
    slug: string;
    title: string;
  } | null>(null);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      {/* Hero */}
      <div
        data-testid="writing-practice-hero"
        className="relative shrink-0 overflow-hidden border-b bg-linear-to-br from-background via-background to-primary/5"
      >
        <div className="mx-auto w-full min-w-0 max-w-screen-lg px-3 py-8 sm:px-5 sm:py-12">
          <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Writing practice
          </h2>
          {isTeacher ? (
            <p className="mt-3 max-w-xl text-pretty text-base text-muted-foreground sm:text-sm">
              Create and send lessons on grammar, syntax, and revision to hone
              your students' writing.
            </p>
          ) : (
            <div
              data-testid="writing-practice-student-intro"
              className="mt-3 max-w-xl space-y-2"
            >
              <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                Short lessons on grammar, sentence structure, and revision. This
                is practice, not graded work.
              </p>
              <p className="text-pretty text-base text-muted-foreground sm:text-sm">
                Pick a lesson below, read the example, then answer the practice
                prompt. Your answers stay on your screen and are not sent to
                your teacher.
              </p>
            </div>
          )}
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
              <p className="text-xl font-semibold tabular-nums">{topicCount}</p>
              <p className="text-base text-muted-foreground sm:text-sm">
                Topics
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Assigned practice */}
      {assignments.length > 0 ? (
        <div className="mx-auto w-full min-w-0 max-w-screen-lg px-3 pt-8 sm:px-5">
          <h3 className="text-lg font-semibold tracking-tight">
            {isTeacher ? 'Practice you assigned' : 'Assigned to you'}
          </h3>
          <div
            data-testid="writing-practice-assignment-list"
            className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                data-testid={`writing-practice-assignment-${assignment.id}`}
                className="rounded-xl border bg-popover p-5 shadow-sm ring-1 ring-black/5"
              >
                <p className="text-balance text-base font-semibold">
                  {assignment.title}
                </p>
                <p className="mt-1 text-pretty text-base text-muted-foreground sm:text-sm">
                  {assignment.classes.map((klass) => klass.label).join(' • ') ||
                    'No active classes'}
                </p>
                {assignment.instructions ? (
                  <p className="mt-2 text-pretty text-base text-muted-foreground sm:text-sm">
                    {assignment.instructions}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-base text-muted-foreground sm:text-sm">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3.5 shrink-0" />
                    Due {assignment.dueAt}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Zap className="size-3.5 shrink-0" />
                    {assignment.problemCount} problems
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {assignment.lessons.map((lesson) => (
                    <span
                      key={lesson.slug}
                      className="inline-flex items-center rounded-full border px-2.5 py-1 text-base font-medium text-muted-foreground sm:text-sm"
                    >
                      {lesson.title}
                    </span>
                  ))}
                </div>
                {/* The assignment is a specific set of problems, not the
                    lesson page — so this opens the runner (student) or the
                    results roll-up (teacher), never the generic lesson. */}
                <div className="mt-4 flex flex-wrap gap-2">
                  {isTeacher
                    ? assignment.classes.map((klass) => (
                        <Button
                          key={klass.id}
                          asChild
                          variant="outline"
                          size="sm"
                        >
                          <Link
                            to={`/app/writing-lessons/results/${klass.classAssignmentId}`}
                          >
                            {assignment.classes.length > 1
                              ? `${klass.label} results`
                              : 'View results'}
                            <ChevronRight className="ml-1 size-3.5 shrink-0" />
                          </Link>
                        </Button>
                      ))
                    : assignment.classes.slice(0, 1).map((klass) => (
                        <Button key={klass.id} asChild size="sm">
                          <Link
                            data-testid={`writing-practice-start-${assignment.id}`}
                            to={`/app/writing-lessons/assigned/${klass.classAssignmentId}`}
                          >
                            Start practice
                            <ChevronRight className="ml-1 size-3.5 shrink-0" />
                          </Link>
                        </Button>
                      ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Lessons, grouped by section. Sections start collapsed so the index
          stays compact as Composition adds more lessons. */}
      <div className="mx-auto flex w-full min-w-0 max-w-screen-lg flex-col gap-6 px-3 py-8 pb-24 sm:px-5">
        {sections.map((section) => {
          const sectionLessons = section.groups.flatMap(
            (group) => group.lessons
          );
          return (
            <Collapsible key={section.section} className="flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <h3 className="flex-1 text-lg font-semibold tracking-tight">
                  <CollapsibleTrigger className="group flex w-full items-center gap-2 text-left">
                    <ChevronDown className="size-5 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]:-rotate-90" />
                    {section.section}
                  </CollapsibleTrigger>
                </h3>
                <Badge variant="secondary" size="sm">
                  {sectionLessons.length}
                </Badge>
              </div>
              <CollapsibleContent>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.groups.flatMap((group) =>
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
                          <p className="mt-1.5 line-clamp-2 pr-9 text-balance text-base font-semibold">
                            {lesson.title}
                          </p>
                          <p className="mt-1 line-clamp-2 text-pretty text-base text-muted-foreground sm:text-sm">
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
              </CollapsibleContent>
            </Collapsible>
          );
        })}
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
