import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Loader2,
  PartyPopper,
} from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  data as dataResponse,
  redirect,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { isWritingPracticeEnabledForOrganization } from '~/utils/feature-gates.server';
import {
  buildAssignedPracticeSequence,
  getAssignedPracticeForStudentById,
  recordWritingPracticeAttempt,
} from '~/utils/writing-lessons/practice-assignments.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';
import {
  getQuickWritingLessonContext,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const enabled = await isWritingPracticeEnabledForOrganization(
    profile.organization.id
  );
  if (!enabled) {
    return redirect('/app');
  }

  const classAssignment = await getAssignedPracticeForStudentById(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!classAssignment) {
    throw new Response('Assigned practice not found', { status: 404 });
  }

  const { assignment } = classAssignment;
  const sequence = buildAssignedPracticeSequence(
    assignment.lessonSlugs,
    assignment.problemCount
  );
  const completedCount = Math.min(
    classAssignment.attempts.length,
    assignment.problemCount
  );

  return dataResponse({
    classAssignmentId: classAssignment.id,
    title: assignment.title,
    instructions: assignment.instructions,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    problemCount: assignment.problemCount,
    sequence,
    completedCount,
  });
}

type AssignedActionData = {
  position: number;
  feedback: PracticeFeedbackResult;
  recorded: boolean;
};

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const enabled = await isWritingPracticeEnabledForOrganization(
    profile.organization.id
  );
  if (!enabled) {
    return redirect('/app');
  }

  const classAssignment = await getAssignedPracticeForStudentById(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!classAssignment) {
    throw new Response('Assigned practice not found', { status: 404 });
  }

  const formData = await request.formData();
  const position = Number(formData.get('position'));
  const lessonSlug = String(formData.get('lessonSlug') ?? '');
  const promptId = String(formData.get('promptId') ?? '');
  const response = String(formData.get('response') ?? '');

  // The lesson must belong to this assignment, and the prompt to that lesson.
  if (!classAssignment.assignment.lessonSlugs.includes(lessonSlug)) {
    throw new Response('That prompt is not part of this assignment', {
      status: 400,
    });
  }
  const context = getQuickWritingLessonContext(lessonSlug);
  const prompt = getQuickWritingPracticePrompts(lessonSlug).find(
    (item) => item.id === promptId
  );
  if (!context || !prompt) {
    throw new Response('Unknown practice prompt', { status: 400 });
  }

  const feedback = await generatePracticeFeedback({
    lessonTitle: context.title,
    skill: context.skill,
    rule: context.rule,
    exercise: prompt.exercise,
    instruction: prompt.instruction,
    response,
  });

  // Persist only real attempts, not the empty-response guardrail.
  let recorded = false;
  if (response.trim().length > 0) {
    await recordWritingPracticeAttempt({
      classAssignmentId: classAssignment.id,
      membershipId: profile.id,
      lessonSlug,
      promptId,
      exercise: prompt.exercise,
      instruction: prompt.instruction,
      response,
      feedback,
    });
    recorded = true;
  }

  return dataResponse<AssignedActionData>({
    position: Number.isFinite(position) ? position : 0,
    feedback,
    recorded,
  });
}

const STATUS_STYLES: Record<PracticeFeedbackResult['status'], string> = {
  strong: 'bg-emerald-100 text-emerald-900',
  developing: 'bg-amber-100 text-amber-900',
  needs_revision: 'bg-rose-100 text-rose-900',
};

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AssignedPracticeRoute() {
  const { title, instructions, dueAt, problemCount, sequence, completedCount } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher<AssignedActionData>();
  const [pointer, setPointer] = useState(
    Math.min(completedCount, sequence.length)
  );
  const [response, setResponse] = useState('');
  const [sessionAnswered, setSessionAnswered] = useState<number[]>([]);

  const currentItem = sequence[pointer] ?? null;
  const isChecking = fetcher.state !== 'idle';
  const responseReady = response.trim().length > 0;

  const feedback =
    fetcher.data && fetcher.data.position === currentItem?.position
      ? fetcher.data.feedback
      : null;
  const currentAnswered = feedback !== null && fetcher.data?.recorded === true;

  const doneCount = Math.min(
    problemCount,
    completedCount + sessionAnswered.length
  );
  const progressPct =
    problemCount > 0 ? Math.round((doneCount / problemCount) * 100) : 0;

  function goNext() {
    if (currentItem && !sessionAnswered.includes(currentItem.position)) {
      setSessionAnswered((prev) => [...prev, currentItem.position]);
    }
    setPointer((prev) => prev + 1);
    setResponse('');
  }

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
              Assigned practice
            </p>
            <h2 className="mt-1">{title ?? 'Writing practice'}</h2>
            {instructions ? (
              <p className="mt-3 max-w-full text-base text-muted-foreground sm:max-w-[620px] sm:text-sm">
                {instructions}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" size="sm">
                {doneCount} of {problemCount} done
              </Badge>
              {dueAt ? (
                <Badge variant="outline" size="sm">
                  Due {formatDueDate(dueAt)}
                </Badge>
              ) : null}
            </div>
            <div className="mt-3 h-2 w-full max-w-[620px] rounded-full bg-secondary-foreground/10">
              <div
                className="h-2 rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-screen-lg flex-col gap-6 px-3 py-6 pb-24 sm:px-5">
        {sequence.length === 0 ? (
          <p className="text-base text-muted-foreground sm:text-sm">
            This assignment has no practice prompts yet.
          </p>
        ) : currentItem ? (
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-xl">
                  Problem {currentItem.position} of {problemCount}
                </CardTitle>
                <Link
                  to={`/app/writing-lessons/${currentItem.lessonSlug}`}
                  className="inline-flex items-center gap-1 text-base text-primary hover:underline sm:text-sm"
                >
                  <BookOpen className="h-4 w-4" />
                  Review lesson: {currentItem.lessonTitle}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <fetcher.Form method="post" className="space-y-4">
                <input
                  type="hidden"
                  name="position"
                  value={currentItem.position}
                />
                <input
                  type="hidden"
                  name="lessonSlug"
                  value={currentItem.lessonSlug}
                />
                <input
                  type="hidden"
                  name="promptId"
                  value={currentItem.prompt.id}
                />

                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-base text-foreground sm:text-sm">
                    {currentItem.prompt.exercise}
                  </p>
                  <p className="mt-3 text-base text-muted-foreground sm:text-sm">
                    {currentItem.prompt.instruction}
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="assigned-response"
                    className="text-base font-medium text-foreground sm:text-sm"
                  >
                    Your practice response
                  </label>
                  <Textarea
                    id="assigned-response"
                    name="response"
                    value={response}
                    onChange={(event) => setResponse(event.currentTarget.value)}
                    placeholder="Rewrite the sentence here."
                    className="min-h-28 text-base sm:text-sm"
                    disabled={currentAnswered}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {!currentAnswered ? (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={!responseReady || isChecking}
                    >
                      {isChecking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      {isChecking ? 'Checking…' : 'Check & save'}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={goNext}>
                      {pointer + 1 >= problemCount ? 'Finish' : 'Next problem'}
                    </Button>
                  )}
                </div>

                {feedback ? (
                  <PracticeFeedbackPanel feedback={feedback} />
                ) : null}
              </fetcher.Form>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <PartyPopper className="h-8 w-8 text-primary" />
              <p className="text-lg font-semibold">
                You’ve completed this assigned practice.
              </p>
              <p className="max-w-[420px] text-base text-muted-foreground sm:text-sm">
                All {problemCount} problems are done. You can revisit the
                lessons any time from the practice library.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link to="/app/writing-lessons">Back to practice</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function PracticeFeedbackPanel({
  feedback,
}: {
  feedback: PracticeFeedbackResult;
}) {
  return (
    <div
      data-testid="practice-feedback"
      className="space-y-3 rounded-lg border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[feedback.status]}`}
        >
          {practiceFeedbackStatusLabel(feedback.status)}
        </span>
        {feedback.degraded ? (
          <span className="text-xs text-muted-foreground">
            Quick self-check · tutor offline
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Tutor feedback</span>
        )}
      </div>

      <p className="text-base text-foreground sm:text-sm">{feedback.summary}</p>

      {feedback.strengths.length > 0 ? (
        <div className="space-y-1">
          <p className="text-base font-medium sm:text-sm">What worked</p>
          <ul className="list-disc space-y-1 pl-5 text-base text-muted-foreground sm:text-sm">
            {feedback.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.focus.length > 0 ? (
        <div className="space-y-1">
          <p className="text-base font-medium sm:text-sm">Focus next on</p>
          <ul className="list-disc space-y-1 pl-5 text-base text-muted-foreground sm:text-sm">
            {feedback.focus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-base italic text-muted-foreground sm:text-sm">
        {feedback.encouragement}
      </p>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
