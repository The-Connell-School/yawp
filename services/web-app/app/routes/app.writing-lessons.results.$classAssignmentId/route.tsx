import { ArrowLeft, CheckCircle2, Circle, Sparkles } from 'lucide-react';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/accordion';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { isWritingPracticeEnabledForOrganization } from '~/utils/feature-gates.server';
import { getWritingPracticeResultsForTeacher } from '~/utils/writing-lessons/practice-assignments.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
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

  const { classAssignment, results, attemptsByStudent } = data;
  const lessonTitles = classAssignment.assignment.lessonSlugs
    .map((slug) => getQuickWritingLessonBySlug(slug)?.title)
    .filter((title): title is string => Boolean(title));

  const completedCount = results.filter((row) => row.completed).length;
  const startedCount = results.filter((row) => row.attemptCount > 0).length;

  // Attach each student's attempts (prompt + answer + feedback) to their row.
  const resultsWithAttempts = results.map((row) => ({
    ...row,
    attempts: (attemptsByStudent[row.membershipId] ?? []).map((attempt) => ({
      id: attempt.id,
      lessonTitle:
        getQuickWritingLessonBySlug(attempt.lessonSlug)?.title ?? 'Practice',
      exercise: attempt.exercise,
      instruction: attempt.instruction,
      response: attempt.response,
      status: attempt.status,
      feedback: attempt.feedback,
      createdAt: attempt.createdAt.toISOString(),
    })),
  }));

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
    results: resultsWithAttempts,
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
            {results.length === 0 ? (
              <p className="px-4 py-6 text-base text-muted-foreground sm:text-sm">
                No students are enrolled in this class yet.
              </p>
            ) : (
              <Accordion type="multiple" className="border-t">
                {results.map((row) => (
                  <AccordionItem
                    key={row.membershipId}
                    value={row.membershipId}
                    disabled={row.attempts.length === 0}
                  >
                    <AccordionTrigger
                      data-testid="student-progress-row"
                      className="gap-3 px-4 py-3 hover:no-underline data-[disabled]:opacity-70 [&[data-disabled]>svg]:hidden"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3 text-left">
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
                            <p className="truncate text-xs font-normal text-muted-foreground">
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
                    </AccordionTrigger>
                    <AccordionContent className="bg-muted/30 px-4">
                      <div
                        className="space-y-3 pt-1"
                        data-testid="student-attempts"
                      >
                        {row.attempts.map((attempt, index) => (
                          <AttemptCard
                            key={attempt.id}
                            position={index + 1}
                            attempt={attempt}
                          />
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

type AttemptView = {
  id: string;
  lessonTitle: string;
  exercise: string;
  instruction: string;
  response: string;
  status: string;
  feedback: PracticeFeedbackResult;
  createdAt: string;
};

function AttemptCard({
  position,
  attempt,
}: {
  position: number;
  attempt: AttemptView;
}) {
  const { feedback } = attempt;
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Problem {position} · {attempt.lessonTitle}
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            STATUS_STYLES[attempt.status as PracticeFeedbackStatus] ??
            'bg-muted text-muted-foreground'
          }`}
        >
          {practiceFeedbackStatusLabel(attempt.status as PracticeFeedbackStatus)}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prompt
          </p>
          <p className="text-foreground">{attempt.exercise}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Student answer
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-1.5 text-foreground">
            {attempt.response}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2 border-t border-border/60 pt-2.5">
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {feedback.degraded ? 'Quick self-check' : 'Tutor feedback'}
          </p>
        </div>
        <p className="text-sm text-foreground">{feedback.summary}</p>
        {feedback.strengths.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {feedback.strengths.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {feedback.focus.length > 0 ? (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {feedback.focus.map((item) => (
              <li key={item} className="flex gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
