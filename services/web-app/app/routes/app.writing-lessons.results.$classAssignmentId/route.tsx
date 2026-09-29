import { ArrowLeft, CheckCircle2, Circle, XCircle } from 'lucide-react';
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
import {
  NO_CHANGE_LABEL,
  isActAttemptRecord,
  splitAroundUnderline,
} from '~/utils/writing-lessons/act-practice.shared';
import { writingPracticeAssignmentTitle } from '~/utils/writing-lessons/assignment-title';
import { getWritingPracticeResultsForTeacher } from '~/utils/writing-lessons/practice-assignments.server';
import {
  isCompositionAttemptRecord,
  practiceFeedbackStatusLabel,
  type CompositionAttemptRecord,
  type PracticeFeedbackStatus,
} from '~/utils/writing-lessons/practice-feedback.shared';
import { getQuickWritingLessonBySlug } from '~/utils/writing-lessons/static-lessons.server';

function choiceLabel(choices: string[], index: number): string {
  const letter = String.fromCharCode(65 + index);
  const text = index === 0 ? NO_CHANGE_LABEL : (choices[index] ?? '');
  return `${letter}. ${text}`;
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
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
  // Composition is always enabled.
  const lessonTitles = classAssignment.assignment.lessonSlugs
    .map((slug) => getQuickWritingLessonBySlug(slug)?.title)
    .filter((title): title is string => Boolean(title));
  const hasComposition = classAssignment.assignment.lessonSlugs.some(
    (slug) => getQuickWritingLessonBySlug(slug)?.section === 'Composition'
  );

  const completedCount = results.filter((row) => row.completed).length;
  const startedCount = results.filter((row) => row.attemptCount > 0).length;

  // Attach each student's attempts, collapsing composition revisions to the
  // latest attempt per prompt (with a revision count) so the teacher sees one
  // card per problem rather than one per resubmission.
  const resultsWithAttempts = results.map((row) => {
    const byPrompt = new Map<
      string,
      { latest: (typeof attemptsByStudent)[string][number]; revisions: number }
    >();
    for (const attempt of attemptsByStudent[row.membershipId] ?? []) {
      const existing = byPrompt.get(attempt.promptId);
      if (!existing) {
        byPrompt.set(attempt.promptId, { latest: attempt, revisions: 1 });
      } else {
        existing.revisions += 1;
        if (attempt.createdAt >= existing.latest.createdAt) {
          existing.latest = attempt;
        }
      }
    }
    return {
      ...row,
      attempts: Array.from(byPrompt.values()).map(({ latest, revisions }) => ({
        id: latest.id,
        lessonTitle:
          getQuickWritingLessonBySlug(latest.lessonSlug)?.title ?? 'Practice',
        status: latest.status,
        record: latest.attempt,
        revisions,
        createdAt: latest.createdAt.toISOString(),
      })),
    };
  });

  return dataResponse({
    classLabel:
      classAssignment.class.title ??
      `Grade ${classAssignment.class.grade} · Period ${classAssignment.class.period}`,
    title: writingPracticeAssignmentTitle(classAssignment.assignment),
    lessonTitles,
    hasComposition,
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
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
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
    hasComposition,
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
            <h2 className="mt-1">{title}</h2>
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
                  >
                    <AccordionTrigger
                      data-testid="student-progress-row"
                      className="gap-3 px-4 py-3 hover:no-underline"
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
                        {hasComposition && row.masteredCount > 0 ? (
                          <span className="hidden items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900 sm:inline-flex">
                            {row.masteredCount} mastered
                          </span>
                        ) : null}
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
                        {row.attempts.length === 0 ? (
                          <p className="py-2 text-sm text-muted-foreground">
                            {(row.name ?? 'This student').split(' ')[0]} hasn
                            &rsquo;t started this practice yet.
                          </p>
                        ) : (
                          row.attempts.map((attempt, index) => (
                            <AttemptCard
                              key={attempt.id}
                              position={index + 1}
                              attempt={attempt}
                            />
                          ))
                        )}
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
  status: string;
  record: unknown;
  revisions: number;
  createdAt: string;
};

function AttemptCard({
  position,
  attempt,
}: {
  position: number;
  attempt: AttemptView;
}) {
  const { record } = attempt;
  // Constructed-response attempts show the prompt, the student's writing, and
  // the tutor feedback it earned.
  if (isCompositionAttemptRecord(record)) {
    return (
      <CompositionAttemptCard
        position={position}
        attempt={attempt}
        record={record}
      />
    );
  }
  // Older attempts stored free-text feedback rather than an ACT record; render a
  // graceful summary for those instead of crashing on the missing ACT fields.
  if (!isActAttemptRecord(record)) {
    return <LegacyAttemptCard position={position} attempt={attempt} />;
  }
  const parts = splitAroundUnderline(record.sentence, record.underline);
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Problem {position} · {attempt.lessonTitle}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            record.correct
              ? 'bg-emerald-100 text-emerald-900'
              : 'bg-rose-100 text-rose-900'
          }`}
        >
          {record.correct ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <XCircle className="h-3.5 w-3.5" />
          )}
          {record.correct ? 'Correct' : 'Incorrect'}
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Question
          </p>
          <p className="text-foreground">
            {parts.before}
            {parts.underlined ? (
              <span className="font-semibold underline decoration-2 underline-offset-4">
                {parts.underlined}
              </span>
            ) : null}
            {parts.after}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Their answer
          </p>
          <p
            className={`rounded-md px-2.5 py-1.5 ${
              record.correct
                ? 'bg-emerald-50 text-emerald-900'
                : 'bg-rose-50 text-rose-900'
            }`}
          >
            {choiceLabel(record.choices, record.selectedChoiceIndex)}
          </p>
        </div>
        {!record.correct ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Correct answer
            </p>
            <p className="rounded-md bg-emerald-50 px-2.5 py-1.5 text-emerald-900">
              {choiceLabel(record.choices, record.correctChoiceIndex)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 border-t border-border/60 pt-2.5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {record.explanation}
        </p>
      </div>
    </div>
  );
}

/**
 * A constructed-response (composition) attempt: the prompt, the student's
 * exact writing, and the tutor feedback it earned — the teacher-facing
 * counterpart of the student's in-flow feedback panel.
 */
function CompositionAttemptCard({
  position,
  attempt,
  record,
}: {
  position: number;
  attempt: AttemptView;
  record: CompositionAttemptRecord;
}) {
  const status = record.status as PracticeFeedbackStatus;
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Problem {position} · {attempt.lessonTitle}
          {attempt.revisions > 1 ? (
            <span className="ml-2 font-normal normal-case text-muted-foreground/80">
              · revised {attempt.revisions}×
            </span>
          ) : null}
        </span>
        {STATUS_STYLES[status] ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {practiceFeedbackStatusLabel(status)}
          </span>
        ) : null}
      </div>

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Prompt
          </p>
          <p className="text-foreground">{record.exercise}</p>
          <p className="mt-0.5 text-muted-foreground">{record.instruction}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Their response
          </p>
          <p className="whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-1.5 text-foreground">
            {record.response}
          </p>
        </div>
      </div>

      <div className="mt-3 border-t border-border/60 pt-2.5">
        <p className="text-sm leading-relaxed text-muted-foreground">
          {record.summary}
          {record.degraded
            ? ' (The tutor was offline for this attempt, so it was never checked for correctness.)'
            : ''}
        </p>
      </div>
    </div>
  );
}

/**
 * Fallback for attempts persisted before the ACT multiple-choice format (their
 * `feedbackJson` holds a free-text feedback blob). Shows whatever summary text
 * is available plus the status badge so the row is still informative.
 */
function LegacyAttemptCard({
  position,
  attempt,
}: {
  position: number;
  attempt: AttemptView;
}) {
  const record = (attempt.record ?? {}) as { summary?: unknown };
  const summary =
    typeof record.summary === 'string' && record.summary.trim().length > 0
      ? record.summary
      : 'This attempt was recorded before multiple-choice practice, so the answer detail isn’t available.';
  const status = attempt.status as PracticeFeedbackStatus;
  return (
    <div className="rounded-lg border border-border/70 bg-background p-3.5">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Problem {position} · {attempt.lessonTitle}
        </span>
        {STATUS_STYLES[status] ? (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
          >
            {practiceFeedbackStatusLabel(status)}
          </span>
        ) : null}
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">{summary}</p>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
