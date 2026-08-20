import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Loader2,
  PartyPopper,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  Link,
  data as dataResponse,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { ActPracticeQuestionView } from '~/components/writing-lessons/act-practice-question';
import { CompositionPrompt } from '~/components/writing-lessons/composition-prompt';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import {
  gradeActAnswer,
  type ActGradeResult,
} from '~/utils/writing-lessons/act-practice.shared';
import { writingPracticeAssignmentTitle } from '~/utils/writing-lessons/assignment-title';
import {
  getAssignedPracticeForStudentById,
  getOrCreateStudentPracticeSet,
  recordCompositionPracticeAttempt,
  recordWritingPracticeAttempt,
} from '~/utils/writing-lessons/practice-assignments.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import {
  detectPracticeGuardrail,
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';
import { getQuickWritingLessonContext } from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const classAssignment = await getAssignedPracticeForStudentById(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!classAssignment) {
    throw new Response('Assigned practice not found', { status: 404 });
  }

  const { assignment } = classAssignment;
  const sequence = await getOrCreateStudentPracticeSet({
    classAssignmentId: classAssignment.id,
    membershipId: profile.id,
    lessonSlugs: assignment.lessonSlugs,
    problemCount: assignment.problemCount,
  });

  // Collapse the student's attempts (which now include composition revisions)
  // into per-problem state so each item knows whether it is already mastered.
  const attemptedPromptIds = new Set(
    classAssignment.attempts.map((attempt) => attempt.promptId)
  );
  const masteredPromptIds = new Set(
    classAssignment.attempts
      .filter((attempt) => attempt.status === 'strong')
      .map((attempt) => attempt.promptId)
  );
  const items = sequence.map((item) => {
    const promptId =
      item.kind === 'composition' ? item.prompt.id : item.question.id;
    // ACT problems are done once answered; composition problems are done only
    // once mastered (a `strong` tutor verdict) — a wrong-then-abandoned answer
    // stays "attempted".
    const done =
      item.kind === 'composition'
        ? masteredPromptIds.has(promptId)
        : attemptedPromptIds.has(promptId);
    const initialStatus: 'done' | 'attempted' | 'todo' = done
      ? 'done'
      : attemptedPromptIds.has(promptId)
        ? 'attempted'
        : 'todo';
    return { ...item, initialStatus };
  });

  const hasComposition = sequence.some((item) => item.kind === 'composition');

  return dataResponse({
    classAssignmentId: classAssignment.id,
    title: writingPracticeAssignmentTitle(assignment),
    instructions: assignment.instructions,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    problemCount: assignment.problemCount,
    items,
    hasComposition,
  });
}

type AssignedActionData =
  | {
      kind: 'act';
      position: number;
      grade: ActGradeResult;
      recorded: boolean;
    }
  | {
      kind: 'composition';
      position: number;
      feedback: PracticeFeedbackResult;
      recorded: boolean;
    };

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const classAssignment = await getAssignedPracticeForStudentById(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!classAssignment) {
    throw new Response('Assigned practice not found', { status: 404 });
  }

  const formData = await request.formData();
  const kind = String(formData.get('kind') ?? 'act');
  const position = Number(formData.get('position'));
  const lessonSlug = String(formData.get('lessonSlug') ?? '');
  const promptId = String(formData.get('promptId') ?? '');
  const safePosition = Number.isFinite(position) ? position : 0;

  // The item must belong to this student's stored set for the assignment.
  const sequence = await getOrCreateStudentPracticeSet({
    classAssignmentId: classAssignment.id,
    membershipId: profile.id,
    lessonSlugs: classAssignment.assignment.lessonSlugs,
    problemCount: classAssignment.assignment.problemCount,
  });

  // Constructed-response (composition) problems: the tutor feedback service
  // grades the writing and the attempt is persisted with it. Guardrailed
  // submissions (blank / unchanged) get feedback but are NOT recorded, so
  // they never consume assignment progress.
  if (kind === 'composition') {
    const item = sequence.find(
      (candidate) =>
        candidate.kind === 'composition' &&
        candidate.prompt.id === promptId &&
        candidate.lessonSlug === lessonSlug
    );
    const context = getQuickWritingLessonContext(lessonSlug);
    if (!item || item.kind !== 'composition' || !context) {
      throw new Response('Unknown or invalid practice answer', { status: 400 });
    }
    const responseText = String(formData.get('response') ?? '');

    const guardrail = detectPracticeGuardrail({
      exercise: item.prompt.exercise,
      response: responseText,
    });
    if (guardrail) {
      return dataResponse<AssignedActionData>({
        kind: 'composition',
        position: safePosition,
        feedback: { ...guardrail, degraded: false },
        recorded: false,
      });
    }

    const feedback = await generatePracticeFeedback({
      lessonTitle: context.title,
      skill: context.skill,
      rule: context.rule,
      exercise: item.prompt.exercise,
      instruction: item.prompt.instruction,
      response: responseText,
    });

    await recordCompositionPracticeAttempt({
      classAssignmentId: classAssignment.id,
      membershipId: profile.id,
      lessonSlug,
      prompt: item.prompt,
      response: responseText,
      feedback,
    });

    return dataResponse<AssignedActionData>({
      kind: 'composition',
      position: safePosition,
      feedback,
      recorded: true,
    });
  }

  const selectedChoiceIndex = Number(formData.get('selectedChoiceIndex'));
  const item = sequence.find(
    (candidate) =>
      candidate.kind !== 'composition' &&
      candidate.question.id === promptId &&
      candidate.lessonSlug === lessonSlug
  );
  if (
    !item ||
    item.kind === 'composition' ||
    !Number.isInteger(selectedChoiceIndex) ||
    selectedChoiceIndex < 0 ||
    selectedChoiceIndex >= item.question.choices.length
  ) {
    throw new Response('Unknown or invalid practice answer', { status: 400 });
  }

  const grade = gradeActAnswer(item.question, selectedChoiceIndex);

  await recordWritingPracticeAttempt({
    classAssignmentId: classAssignment.id,
    membershipId: profile.id,
    lessonSlug,
    question: item.question,
    selectedChoiceIndex,
    grade,
  });

  return dataResponse<AssignedActionData>({
    kind: 'act',
    position: safePosition,
    grade,
    recorded: true,
  });
}

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function AssignedPracticeRoute() {
  const {
    classAssignmentId,
    title,
    instructions,
    dueAt,
    problemCount,
    items,
    hasComposition,
  } = useLoaderData<typeof loader>();

  const fetcher = useFetcher<AssignedActionData>();
  // Positions the student has finished: composition problems require mastery
  // (a `strong` verdict), ACT problems just need an answer.
  const [donePositions, setDonePositions] = useState<Set<number>>(
    () =>
      new Set(
        items
          .filter((item) => item.initialStatus === 'done')
          .map((item) => item.position)
      )
  );
  // Composition problems the student has mastered (for the "mastered" tally).
  const [masteredPositions, setMasteredPositions] = useState<Set<number>>(
    () =>
      new Set(
        items
          .filter(
            (item) =>
              item.kind === 'composition' && item.initialStatus === 'done'
          )
          .map((item) => item.position)
      )
  );
  const [attemptedPositions, setAttemptedPositions] = useState<Set<number>>(
    () =>
      new Set(
        items
          .filter((item) => item.initialStatus !== 'todo')
          .map((item) => item.position)
      )
  );

  const firstUnfinished = items.findIndex(
    (item) => !donePositions.has(item.position)
  );
  const [pointer, setPointer] = useState(
    firstUnfinished === -1 ? items.length : firstUnfinished
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [writtenResponse, setWrittenResponse] = useState('');
  // The revision trail for the current composition problem: every recorded
  // draft plus the feedback it earned, kept in order so the student can see
  // their progression from the earliest attempt down to the latest.
  const [draftHistory, setDraftHistory] = useState<
    Array<{ response: string; feedback: PracticeFeedbackResult }>
  >([]);
  // The response text submitted with the in-flight attempt (captured at submit
  // so the effect can pair it with the feedback that comes back).
  const pendingResponseRef = useRef('');
  // Guards the result effect against processing the same fetcher payload twice.
  const lastProcessedRef = useRef<AssignedActionData | null>(null);

  const currentItem = items[pointer] ?? null;
  const isChecking = fetcher.state !== 'idle';

  const currentResult =
    fetcher.data && fetcher.data.position === currentItem?.position
      ? fetcher.data
      : null;
  const grade = currentResult?.kind === 'act' ? currentResult.grade : null;
  // Guardrail feedback (blank / unchanged) isn't recorded and doesn't join the
  // draft trail — show it inline by the textarea instead.
  const guardrailFeedback =
    currentResult?.kind === 'composition' && !currentResult.recorded
      ? currentResult.feedback
      : null;

  // Fold each recorded result into the progress sets and the draft trail.
  useEffect(() => {
    const result = fetcher.data;
    if (!result || !result.recorded) return;
    if (lastProcessedRef.current === result) return;
    lastProcessedRef.current = result;
    const position = result.position;
    setAttemptedPositions((prev) => new Set(prev).add(position));
    if (result.kind === 'act') {
      // ACT problems are done as soon as they're answered.
      setDonePositions((prev) => new Set(prev).add(position));
      if (result.grade.correct) {
        setMasteredPositions((prev) => new Set(prev).add(position));
      }
    } else {
      // Record this composition draft in the trail...
      setDraftHistory((prev) => [
        ...prev,
        { response: pendingResponseRef.current, feedback: result.feedback },
      ]);
      if (result.feedback.status === 'strong') {
        // ...and mark it done only once mastered.
        setDonePositions((prev) => new Set(prev).add(position));
        setMasteredPositions((prev) => new Set(prev).add(position));
      }
    }
  }, [fetcher.data]);

  const doneCount = Math.min(problemCount, donePositions.size);
  const masteredCount = Math.min(problemCount, masteredPositions.size);
  const progressPct =
    problemCount > 0 ? Math.round((doneCount / problemCount) * 100) : 0;

  const isComposition = currentItem?.kind === 'composition';
  const currentMastered = currentItem
    ? masteredPositions.has(currentItem.position) ||
      (currentResult?.kind === 'composition' &&
        currentResult.feedback.status === 'strong')
    : false;
  const currentAttempted = currentItem
    ? attemptedPositions.has(currentItem.position) ||
      currentResult?.recorded === true
    : false;
  // ACT locks after its single answer; composition locks only after mastery.
  const currentDone = isComposition
    ? currentMastered
    : donePositions.has(currentItem?.position ?? -1) ||
      currentResult?.recorded === true;

  function goNext() {
    setPointer((prev) => prev + 1);
    setSelectedIndex(null);
    setWrittenResponse('');
    setDraftHistory([]);
  }

  function revisitUnfinished() {
    const next = items.findIndex((item) => !donePositions.has(item.position));
    if (next === -1) return;
    setPointer(next);
    setSelectedIndex(null);
    setWrittenResponse('');
    setDraftHistory([]);
  }

  const isLastProblem = pointer + 1 >= items.length;

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
            <h2 className="mt-1">{title}</h2>
            {instructions ? (
              <p className="mt-3 max-w-full text-base text-muted-foreground sm:max-w-[620px] sm:text-sm">
                {instructions}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {hasComposition ? (
                <Badge variant="secondary" size="sm">
                  {masteredCount} of {problemCount} mastered
                </Badge>
              ) : (
                <Badge variant="secondary" size="sm">
                  {doneCount} of {problemCount} done
                </Badge>
              )}
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
        {items.length === 0 ? (
          <p className="text-base text-muted-foreground sm:text-sm">
            This assignment has no practice questions yet.
          </p>
        ) : currentItem ? (
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-xl">
                  Problem {currentItem.position} of {problemCount}
                </CardTitle>
                <Link
                  to={`/app/writing-lessons/${currentItem.lessonSlug}?from=${encodeURIComponent(
                    `/app/writing-lessons/assigned/${classAssignmentId}`
                  )}`}
                  className="inline-flex items-center gap-1 text-base text-primary hover:underline sm:text-sm"
                >
                  <BookOpen className="h-4 w-4" />
                  Review lesson: {currentItem.lessonTitle}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <fetcher.Form
                method="post"
                className="space-y-4"
                onSubmit={() => {
                  pendingResponseRef.current = writtenResponse;
                }}
              >
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

                {currentItem.kind === 'composition' ? (
                  <>
                    <input type="hidden" name="kind" value="composition" />
                    <input
                      type="hidden"
                      name="promptId"
                      value={currentItem.prompt.id}
                    />
                    <CompositionPrompt
                      exercise={currentItem.prompt.exercise}
                      instruction={currentItem.prompt.instruction}
                    />

                    {draftHistory.length > 0 ? (
                      <div
                        className="space-y-2"
                        data-testid="composition-draft-history"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          Your drafts so far
                        </p>
                        {draftHistory.map((draft, index) => (
                          <DraftHistoryEntry
                            key={index}
                            index={index + 1}
                            response={draft.response}
                            feedback={draft.feedback}
                          />
                        ))}
                      </div>
                    ) : null}

                    {currentMastered ? (
                      <div
                        data-testid="composition-mastered"
                        className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900"
                      >
                        <Sparkles className="h-4 w-4 shrink-0" />
                        Mastered — nice work.
                      </div>
                    ) : (
                      <>
                        <label className="text-sm font-medium text-foreground">
                          {draftHistory.length > 0
                            ? `Your next draft (attempt ${draftHistory.length + 1})`
                            : 'Your response'}
                        </label>
                        <Textarea
                          name="response"
                          data-testid="assigned-composition-response"
                          aria-label="Your response"
                          value={writtenResponse}
                          onChange={(event) =>
                            setWrittenResponse(event.target.value)
                          }
                          placeholder={
                            draftHistory.length > 0
                              ? 'Revise your draft and resubmit…'
                              : 'Write your response here…'
                          }
                          className="min-h-28 text-base sm:text-sm"
                        />
                        {guardrailFeedback ? (
                          <div
                            data-testid="assigned-composition-feedback"
                            className="rounded-xl border border-border/70 bg-muted/30 p-3 text-sm text-foreground"
                          >
                            {guardrailFeedback.summary}
                          </div>
                        ) : null}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      type="hidden"
                      name="promptId"
                      value={currentItem.question.id}
                    />
                    <input
                      type="hidden"
                      name="selectedChoiceIndex"
                      value={selectedIndex ?? ''}
                    />
                    <ActPracticeQuestionView
                      question={currentItem.question}
                      selectedIndex={selectedIndex}
                      grade={grade}
                      onSelect={setSelectedIndex}
                    />
                  </>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  {currentDone ? (
                    <Button type="button" size="sm" onClick={goNext}>
                      {isLastProblem ? 'Finish' : 'Next problem'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={
                          isChecking ||
                          (isComposition
                            ? writtenResponse.trim().length === 0
                            : selectedIndex === null)
                        }
                      >
                        {isChecking ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : isComposition && currentAttempted ? (
                          <RotateCcw className="mr-2 h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                        )}
                        {isChecking
                          ? 'Saving…'
                          : isComposition && currentAttempted
                            ? 'Revise & resubmit'
                            : 'Check & save'}
                      </Button>
                      {isComposition && currentAttempted ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={goNext}
                        >
                          {isLastProblem ? 'Skip for now' : 'Skip for now →'}
                        </Button>
                      ) : null}
                    </>
                  )}
                </div>
              </fetcher.Form>
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <PartyPopper className="h-8 w-8 text-primary" />
              {doneCount >= problemCount ? (
                <>
                  <p className="text-lg font-semibold">
                    You’ve completed this assigned practice.
                  </p>
                  <p className="max-w-[420px] text-base text-muted-foreground sm:text-sm">
                    {hasComposition
                      ? `All ${problemCount} problems mastered. Revisit any lesson from the practice library anytime.`
                      : `All ${problemCount} problems are done. You can revisit the lessons any time from the practice library.`}
                  </p>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/app/writing-lessons">Back to practice</Link>
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold">
                    Nice work — you’ve been through every problem.
                  </p>
                  <p className="max-w-[440px] text-base text-muted-foreground sm:text-sm">
                    You’ve mastered {masteredCount} of {problemCount}. Head back
                    to sharpen the ones you skipped — revising until it clicks
                    is where the real practice happens.
                  </p>
                  <Button size="sm" onClick={revisitUnfinished}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Keep going: {problemCount - masteredCount} to master
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

function DraftHistoryEntry({
  index,
  response,
  feedback,
}: {
  index: number;
  response: string;
  feedback: PracticeFeedbackResult;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">
          {index}
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Draft {index}
        </span>
      </div>
      <p className="whitespace-pre-wrap rounded-md bg-muted/40 px-2.5 py-1.5 text-sm text-foreground">
        {response}
      </p>
      <div className="mt-2">
        <AssignedCompositionFeedback feedback={feedback} />
      </div>
    </div>
  );
}

function AssignedCompositionFeedback({
  feedback,
}: {
  feedback: PracticeFeedbackResult;
}) {
  return (
    <div
      data-testid="assigned-composition-feedback"
      className="space-y-2 rounded-xl border border-border/70 bg-muted/30 p-4"
    >
      <p className="text-sm font-semibold text-foreground">
        {practiceFeedbackStatusLabel(feedback.status)}
      </p>
      <p className="text-sm leading-relaxed text-foreground">
        {feedback.summary}
      </p>
      {feedback.strengths.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {feedback.strengths.map((strength) => (
            <li key={strength}>{strength}</li>
          ))}
        </ul>
      ) : null}
      {feedback.focus.length > 0 ? (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {feedback.focus.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm italic text-muted-foreground">
        {feedback.encouragement}
      </p>
    </div>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
