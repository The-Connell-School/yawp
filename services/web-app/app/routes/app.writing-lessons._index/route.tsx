import { BookOpen, ChevronRight, ClipboardList, Compass } from 'lucide-react';
import {
  Link,
  data as dataResponse,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getAssignedPracticeForStudent } from '~/utils/writing-lessons/practice-assignments.server';
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

  return dataResponse({ groups, lessonCount, promptCount, assignedPractice });
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function WritingLessonsIndexRoute() {
  const { groups, lessonCount, promptCount, assignedPractice } =
    useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
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
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-8 px-3 py-6 pb-24 sm:px-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-base font-medium sm:text-sm">
              <BookOpen className="h-5 w-5 shrink-0 text-primary sm:h-4 sm:w-4" />
              <span>{lessonCount} lesson families</span>
            </div>
            <p className="mt-2 text-base text-muted-foreground sm:text-sm">
              Recovered Yawp grammar, sentence, and revision lessons.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-base font-medium sm:text-sm">
              <ClipboardList className="h-5 w-5 shrink-0 text-primary sm:h-4 sm:w-4" />
              <span>{promptCount} self-guided practice prompts</span>
            </div>
            <p className="mt-2 text-base text-muted-foreground sm:text-sm">
              Students can answer a prompt and check a first-pass score.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-base font-medium sm:text-sm">
              <Compass className="h-5 w-5 shrink-0 text-primary sm:h-4 sm:w-4" />
              <span>Teacher-assigned ready</span>
            </div>
            <p className="mt-2 text-base text-muted-foreground sm:text-sm">
              The prototype leaves room for class and student targeting.
            </p>
          </div>
        </div>

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
