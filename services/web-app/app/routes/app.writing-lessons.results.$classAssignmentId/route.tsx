import { ArrowLeft, CheckCircle2, Circle } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { isWritingPracticeEnabledForOrganization } from '~/utils/feature-gates.server';
import { getWritingPracticeResultsForTeacher } from '~/utils/writing-lessons/practice-assignments.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackStatus,
} from '~/utils/writing-lessons/practice-feedback.shared';
import { getQuickWritingLessonBySlug } from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const enabled = await isWritingPracticeEnabledForOrganization(
    profile.organization.id
  );
  if (!enabled) {
    return redirect('/app');
  }
  if (profile.role !== 'TEACHER') {
    return redirect('/app/writing-lessons');
  }

  const data = await getWritingPracticeResultsForTeacher(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!data) {
    throw new Response('Assigned practice not found', { status: 404 });
  }

  const { classAssignment, results } = data;
  const lessonTitles = classAssignment.assignment.lessonSlugs
    .map((slug) => getQuickWritingLessonBySlug(slug)?.title)
    .filter((title): title is string => Boolean(title));

  const completedCount = results.filter((row) => row.completed).length;
  const startedCount = results.filter((row) => row.attemptCount > 0).length;

  return dataResponse({
    classLabel:
      classAssignment.class.title ??
      `Grade ${classAssignment.class.grade} · Period ${classAssignment.class.period}`,
    title: classAssignment.assignment.title,
    lessonTitles,
    problemCount: classAssignment.assignment.problemCount,
    dueAt: classAssignment.assignment.dueAt
      ? classAssignment.assignment.dueAt.toISOString()
      : null,
    results,
    completedCount,
    startedCount,
  });
}

function formatDueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_STYLES: Record<PracticeFeedbackStatus, string> = {
  strong: 'bg-emerald-100 text-emerald-900',
  developing: 'bg-amber-100 text-amber-900',
  needs_revision: 'bg-rose-100 text-rose-900',
};

export default function WritingPracticeResultsRoute() {
  const {
    classLabel,
    title,
    lessonTitles,
    problemCount,
    dueAt,
    results,
    completedCount,
    startedCount,
  } = useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Button asChild variant="outline" size="sm" className="mb-5">
            <Link to="/app/writing-lessons">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to practice
            </Link>
          </Button>
          <div className="flex flex-col">
            <p className="text-base font-medium text-primary sm:text-sm">
              Assigned practice · {classLabel}
            </p>
            <h2 className="mt-1">{title ?? 'Writing practice'}</h2>
            <p className="mt-2 text-base text-muted-foreground sm:text-sm">
              {lessonTitles.join(' · ') || 'Practice'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" size="sm">
                {problemCount} problems each
              </Badge>
              <Badge variant="outline" size="sm">
                {completedCount}/{results.length} completed
              </Badge>
              <Badge variant="outline" size="sm">
                {startedCount}/{results.length} started
              </Badge>
              {dueAt ? (
                <Badge variant="outline" size="sm">
                  Due {formatDueDate(dueAt)}
                </Badge>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-4 px-3 py-6 pb-24 sm:px-5">
        <Card className="shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-xl">Student progress</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y">
              {results.map((row) => (
                <li
                  key={row.membershipId}
                  data-testid="student-progress-row"
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {row.completed ? (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-base font-medium sm:text-sm">
                        {row.name ?? row.email}
                      </p>
                      {row.name ? (
                        <p className="truncate text-xs text-muted-foreground">
                          {row.email}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {row.latestStatus ? (
                      <span
                        className={`hidden items-center rounded-full px-2.5 py-0.5 text-xs font-medium sm:inline-flex ${
                          STATUS_STYLES[
                            row.latestStatus as PracticeFeedbackStatus
                          ] ?? 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {practiceFeedbackStatusLabel(
                          row.latestStatus as PracticeFeedbackStatus
                        )}
                      </span>
                    ) : null}
                    <span className="text-base tabular-nums text-muted-foreground sm:text-sm">
                      {row.attemptCount}/{problemCount}
                    </span>
                  </div>
                </li>
              ))}
              {results.length === 0 ? (
                <li className="px-4 py-6 text-base text-muted-foreground sm:text-sm">
                  No students are enrolled in this class yet.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
