import { ChevronRight, ClipboardPlus } from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import {
  AssignmentCreationSheet,
  WRITING_PRACTICE_TYPE_ID,
} from '~/components/assignments/assignment-creation-sheet';
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
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  getAssignedPracticeForStudent,
  getWritingPracticeAssignmentsForTeacher,
} from '~/utils/writing-lessons/practice-assignments.server';
import {
  getQuickWritingLessonGroups,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const groups = getQuickWritingLessonGroups().map((group) => ({
    ...group,
    lessons: group.lessons.map((lesson) => ({
      ...lesson,
      promptCount: getQuickWritingPracticePrompts(lesson.slug).length,
    })),
  }));

  const isTeacher = profile.role === 'TEACHER';

  const teacherClasses = isTeacher
    ? (
        await prisma.class.findMany({
          where: { teachers: { some: { id: profile.id } }, isArchived: false },
          select: { id: true, title: true, grade: true, period: true },
          orderBy: [{ grade: 'asc' }, { period: 'asc' }],
        })
      ).map((klass) => ({
        id: klass.id,
        title: klass.title,
        grade: klass.grade,
        period: klass.period,
      }))
    : [];
  const writingPracticeLessons = isTeacher
    ? groups.flatMap((group) =>
        group.lessons.map((lesson) => ({
          slug: lesson.slug,
          title: lesson.title,
          category: lesson.category,
        }))
      )
    : [];

  const assignedPractice =
    profile.role === 'STUDENT'
      ? (await getAssignedPracticeForStudent(profile.id)).map(
          (classAssignment) => ({
            id: classAssignment.id,
            title: classAssignment.assignment.title,
            problemCount: classAssignment.assignment.problemCount,
            dueAt: classAssignment.assignment.dueAt
              ? classAssignment.assignment.dueAt.toISOString()
              : null,
            completedCount: Math.min(
              classAssignment.attempts.length,
              classAssignment.assignment.problemCount
            ),
          })
        )
      : [];

  const assignedByTeacher =
    profile.role === 'TEACHER'
      ? (await getWritingPracticeAssignmentsForTeacher(profile.id)).map(
          (classAssignment) => ({
            id: classAssignment.id,
            title: classAssignment.assignment.title,
            problemCount: classAssignment.assignment.problemCount,
            dueAt: classAssignment.assignment.dueAt
              ? classAssignment.assignment.dueAt.toISOString()
              : null,
            classLabel:
              classAssignment.class.title ??
              `Grade ${classAssignment.class.grade} · Period ${classAssignment.class.period}`,
            attemptCount: classAssignment._count.attempts,
          })
        )
      : [];

  return dataResponse({
    groups,
    isTeacher,
    teacherClasses,
    writingPracticeLessons,
    assignedPractice,
    assignedByTeacher,
  });
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function TeacherDirections() {
  return (
    <section className="rounded-lg border bg-muted/40 p-4">
      <h3 className="mb-2 text-base font-semibold">
        How writing practice works
      </h3>
      <p className="mb-3 max-w-[70ch] text-sm text-muted-foreground">
        Open any lesson and choose “Assign to your classes” to send a short set
        of targeted rewrite drills. Students get instant, skill-specific
        feedback from the tutor — it guides them toward the fix without handing
        it over — and every attempt is saved. Track who has practiced and how
        they are doing under “Assigned by you.”
      </p>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        When to use it
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/80">
        <li>
          Warm-ups or bell-ringers on a single skill (comma splices, passive
          voice…)
        </li>
        <li>Reteaching after you notice a recurring error in student essays</li>
        <li>Low-stakes practice between larger, graded writing assignments</li>
        <li>Mixed review that combines several skills at once</li>
      </ul>
    </section>
  );
}

export default function WritingLessonsIndexRoute() {
  const {
    groups,
    isTeacher,
    teacherClasses,
    writingPracticeLessons,
    assignedPractice,
    assignedByTeacher,
  } = useLoaderData<typeof loader>();
  const [isAssignOpen, setIsAssignOpen] = useState(false);

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col">
              <p className="text-base font-medium text-primary sm:text-sm">
                Practice
              </p>
              <h2 className="mt-1">Writing practice</h2>
              <p className="mt-3 max-w-full text-base text-muted-foreground sm:max-w-[620px] sm:text-sm">
                Focused lessons and quick rewrite drills for sentence control,
                grammar, and revision habits.
              </p>
            </div>
            {isTeacher ? (
              <>
                <Button
                  className="shrink-0 rounded-full"
                  onClick={() => setIsAssignOpen(true)}
                >
                  <ClipboardPlus className="mr-2 h-4 w-4" />
                  New practice assignment
                </Button>
                <AssignmentCreationSheet
                  open={isAssignOpen}
                  onOpenChange={setIsAssignOpen}
                  entryPoint="dashboard"
                  assignmentTypes={[]}
                  teacherClasses={teacherClasses}
                  initialAssignmentTypeId={WRITING_PRACTICE_TYPE_ID}
                  writingPracticeEnabled
                  writingPracticeLessons={writingPracticeLessons}
                />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
        {isTeacher ? <TeacherDirections /> : null}

        {assignedByTeacher.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Assigned by you</h3>
              <Badge variant="secondary" size="sm">
                {assignedByTeacher.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignedByTeacher.map((assignment) => (
                <Link
                  key={assignment.id}
                  to={`/app/writing-lessons/results/${assignment.id}`}
                  className="block h-full"
                  data-testid="assigned-by-teacher-card"
                >
                  <Card className="flex h-full flex-col shadow-none hover:shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base leading-snug">
                        {assignment.title ?? 'Writing practice'}
                      </CardTitle>
                      <CardDescription className="text-base sm:text-sm">
                        {assignment.classLabel} · {assignment.problemCount}{' '}
                        problems
                        {assignment.dueAt
                          ? ` · Due ${formatDueDate(assignment.dueAt)}`
                          : ''}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex items-center justify-between gap-3 text-base text-muted-foreground sm:text-sm">
                      <span>{assignment.attemptCount} attempts</span>
                      <span className="inline-flex items-center gap-1">
                        View progress
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {assignedPractice.length > 0 ? (
          <section className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">Assigned to you</h3>
              <Badge variant="secondary" size="sm">
                {assignedPractice.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {assignedPractice.map((assignment) => {
                const complete =
                  assignment.completedCount >= assignment.problemCount;
                return (
                  <Link
                    key={assignment.id}
                    to={`/app/writing-lessons/assigned/${assignment.id}`}
                    className="block h-full"
                    data-testid="assigned-practice-card"
                  >
                    <Card className="flex h-full flex-col border-primary/40 shadow-none hover:shadow-sm">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base leading-snug">
                          {assignment.title ?? 'Writing practice'}
                        </CardTitle>
                        <CardDescription className="text-base sm:text-sm">
                          {assignment.completedCount} of{' '}
                          {assignment.problemCount} problems done
                          {assignment.dueAt
                            ? ` · Due ${formatDueDate(assignment.dueAt)}`
                            : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="mt-auto flex items-center justify-between gap-3 text-base text-muted-foreground sm:text-sm">
                        <Badge
                          variant={complete ? 'secondary' : 'default'}
                          size="sm"
                        >
                          {complete ? 'Complete' : 'Continue'}
                        </Badge>
                        <span className="inline-flex items-center gap-1">
                          {complete ? 'Review' : 'Start'}
                          <ChevronRight className="h-4 w-4 shrink-0" />
                        </span>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {groups.map((group) => (
          <section key={group.category} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold">{group.category}</h3>
              <Badge variant="secondary" size="sm">
                {group.lessons.length}
              </Badge>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.lessons.map((lesson) => (
                <Link
                  key={lesson.slug}
                  to={`/app/writing-lessons/${lesson.slug}`}
                  className="block h-full"
                >
                  <Card className="flex h-full flex-col shadow-none hover:shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base leading-snug">
                        {lesson.title}
                      </CardTitle>
                      <CardDescription className="text-base sm:text-sm">
                        {lesson.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="mt-auto flex items-center justify-between gap-3 text-base text-muted-foreground sm:text-sm">
                      <span>{lesson.promptCount} prompts</span>
                      <span className="inline-flex items-center gap-1">
                        Start practice
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
