import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  PartyPopper,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useFetcher } from 'react-router';

import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Textarea } from '~/components/ui/textarea';
import { ActPracticeQuestionView } from '~/components/writing-lessons/act-practice-question';
import { LessonBody } from '~/components/writing-lessons/lesson-body';
import { CompositionPrompt } from '~/components/writing-lessons/composition-prompt';
import { PracticeFeedbackPanel } from '~/components/writing-lessons/practice-feedback-panel';
import {
  gradeActAnswer,
  type ActGradeResult,
  type ActPracticeQuestion,
} from '~/utils/writing-lessons/act-practice.shared';
import type { PracticeFeedbackResult } from '~/utils/writing-lessons/practice-feedback.shared';

/**
 * The on-screen task for a grammar rewrite. The tutor is separately given the
 * lesson's skill and rule, so this only has to say what to produce.
 */
export const REWRITE_INSTRUCTION =
  'Rewrite the whole sentence so the underlined part is correct.';

type PracticePrompt = {
  id: string;
  exercise: string;
  instruction: string;
};

/** One problem in a runner sequence: ACT multiple choice or constructed response. */
export type PracticeRunnerItem = {
  /** 1-based position within the set. */
  position: number;
  lessonSlug: string;
  lessonTitle: string;
  /** Where the student stands on this problem when the screen first loads. */
  initialStatus: 'done' | 'attempted' | 'todo';
} & (
  | { kind?: 'act'; question: ActPracticeQuestion; prompt?: undefined }
  | { kind: 'composition'; prompt: PracticePrompt; question?: undefined }
);

/** What the route action returns after grading one attempt. */
export type PracticeRunnerResult =
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

/**
 * A lesson abridged for the panel a student can open beside the problem they
 * are working, rather than navigating back to the lesson and losing their
 * place. Without one for a lesson the header falls back to a link to it.
 */
export type PracticeLessonRecap = {
  slug: string;
  title: string;
  /** Lesson markdown, rendered by the shared lesson renderer. */
  markdown: string;
};

export type RewriteCheckResult = {
  intent: 'check-rewrite';
  questionId: string;
  feedback: PracticeFeedbackResult;
};

/**
 * The practice screen: one problem at a time, with the set's progress in the
 * header and the student's revision trail underneath a composition prompt.
 *
 * Both practice flows render through this so a student sees the same screen
 * whether their teacher assigned the set or they started one themselves. Only
 * the plumbing differs, and it is passed in:
 *
 * - Assigned practice posts every answer to its route action, which records the
 *   attempt against the assignment (`gradeActOnClient` off).
 * - Self-directed practice grades multiple choice on the client — it is a
 *   deterministic index comparison and nothing is recorded — and only posts
 *   written work, which needs the tutor (`gradeActOnClient` on).
 */
export function PracticeRunner({
  eyebrow,
  title,
  instructions = null,
  dueAt = null,
  headerBadges = null,
  problemCount,
  items,
  hasComposition,
  backTo,
  backLabel,
  reviewFrom,
  lessonRecaps = [],
  gradeActOnClient = false,
  allowRewrite = false,
  submitLabel = 'Check & save',
  submittingLabel = 'Saving…',
  emptyMessage = 'This assignment has no practice questions yet.',
  completionHeadline = 'You’ve completed this assigned practice.',
  completionExtra = null,
}: {
  eyebrow: string;
  title: string;
  instructions?: string | null;
  dueAt?: string | null;
  headerBadges?: ReactNode;
  problemCount: number;
  items: PracticeRunnerItem[];
  hasComposition: boolean;
  backTo: string;
  backLabel: string;
  reviewFrom: string;
  lessonRecaps?: PracticeLessonRecap[];
  gradeActOnClient?: boolean;
  allowRewrite?: boolean;
  submitLabel?: string;
  submittingLabel?: string;
  emptyMessage?: string;
  completionHeadline?: string;
  completionExtra?: ReactNode;
}) {
  const fetcher = useFetcher<PracticeRunnerResult>();
  const formRef = useRef<HTMLFormElement>(null);
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
  // A multiple-choice grade computed on the client, when this flow grades
  // there rather than posting the answer to be recorded.
  const [localResult, setLocalResult] = useState<PracticeRunnerResult | null>(
    null
  );
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
  const lastProcessedRef = useRef<PracticeRunnerResult | null>(null);
  const [isRecapOpen, setRecapOpen] = useState(false);

  const currentItem = items[pointer] ?? null;
  // The refresher for the skill this problem drills, if the flow supplied one.
  const currentRecap =
    lessonRecaps.find((recap) => recap.slug === currentItem?.lessonSlug) ??
    null;
  const isChecking = fetcher.state !== 'idle';
  const isComposition = currentItem?.kind === 'composition';
  // Multiple choice grades on the client only where the flow asks for it;
  // written work always goes to the server, which owns the tutor.
  const gradesLocally = gradeActOnClient && !isComposition;

  const currentResult =
    localResult && localResult.position === currentItem?.position
      ? localResult
      : fetcher.data && fetcher.data.position === currentItem?.position
        ? fetcher.data
        : null;
  const grade = currentResult?.kind === 'act' ? currentResult.grade : null;
  // Guardrail feedback (blank / unchanged) isn't recorded and doesn't join the
  // draft trail — show it inline by the textarea instead.
  const guardrailFeedback =
    currentResult?.kind === 'composition' && !currentResult.recorded
      ? currentResult.feedback
      : null;

  // Fold a graded attempt into the progress sets and the draft trail. Both the
  // client-graded and server-graded paths land here, so progress is tracked in
  // exactly one place.
  function applyResult(result: PracticeRunnerResult) {
    if (!result.recorded) return;
    const position = result.position;
    setAttemptedPositions((prev) => new Set(prev).add(position));
    if (result.kind === 'act') {
      // ACT problems are done as soon as they're answered.
      setDonePositions((prev) => new Set(prev).add(position));
      if (result.grade.correct) {
        setMasteredPositions((prev) => new Set(prev).add(position));
      }
      return;
    }
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

  useEffect(() => {
    const result = fetcher.data;
    if (!result || !result.recorded) return;
    if (lastProcessedRef.current === result) return;
    lastProcessedRef.current = result;
    applyResult(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.data]);

  const doneCount = Math.min(problemCount, donePositions.size);
  const masteredCount = Math.min(problemCount, masteredPositions.size);
  const progressPct =
    problemCount > 0 ? Math.round((doneCount / problemCount) * 100) : 0;

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

  function checkAnswer() {
    if (!currentItem || currentDone || isChecking) return;
    // Written work always goes to the server; multiple choice grades here when
    // this flow has nothing to record.
    if (!gradesLocally) {
      formRef.current?.requestSubmit();
      return;
    }
    if (selectedIndex === null) return;
    const result: PracticeRunnerResult = {
      kind: 'act',
      position: currentItem.position,
      grade: gradeActAnswer(currentItem.question, selectedIndex),
      recorded: true,
    };
    setLocalResult(result);
    applyResult(result);
  }

  function goNext() {
    setRecapOpen(false);
    setPointer((prev) => prev + 1);
    setSelectedIndex(null);
    setWrittenResponse('');
    setDraftHistory([]);
    setLocalResult(null);
  }

  function revisitUnfinished() {
    const next = items.findIndex((item) => !donePositions.has(item.position));
    if (next === -1) return;
    setRecapOpen(false);
    setPointer(next);
    setSelectedIndex(null);
    setWrittenResponse('');
    setDraftHistory([]);
    setLocalResult(null);
  }

  const isLastProblem = pointer + 1 >= items.length;

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="flex w-full justify-between border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Button asChild variant="outline" size="sm" className="mb-5">
            <Link to={backTo}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backLabel}
            </Link>
          </Button>
          <div className="flex flex-col">
            <p className="text-base font-medium text-primary sm:text-sm">
              {eyebrow}
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
              {headerBadges}
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
            {emptyMessage}
          </p>
        ) : currentItem ? (
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle className="text-xl">
                  Problem {currentItem.position} of {problemCount}
                </CardTitle>
                {currentRecap ? (
                  <button
                    type="button"
                    onClick={() => setRecapOpen(true)}
                    className="inline-flex items-center gap-1 text-base text-primary hover:underline sm:text-sm"
                  >
                    <BookOpen className="h-4 w-4" />
                    Review lesson: {currentItem.lessonTitle}
                  </button>
                ) : (
                  <Link
                    to={`/app/writing-lessons/${currentItem.lessonSlug}?from=${encodeURIComponent(
                      reviewFrom
                    )}`}
                    className="inline-flex items-center gap-1 text-base text-primary hover:underline sm:text-sm"
                  >
                    <BookOpen className="h-4 w-4" />
                    Review lesson: {currentItem.lessonTitle}
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <fetcher.Form
                ref={formRef}
                method="post"
                className="space-y-4"
                onSubmit={() => {
                  pendingResponseRef.current = writtenResponse;
                }}
                onKeyDown={(event) => {
                  // Enter checks the answer once a choice is picked — the
                  // keyboard-first flow students expect on the ACT. Only the
                  // textarea is exempt, where Enter has to stay a newline.
                  if ((event.target as HTMLElement).tagName === 'TEXTAREA') {
                    return;
                  }
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    checkAnswer();
                  }
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
                    {/* A self-directed set is built on the fly rather than
                        stored, so the prompt travels with the answer. */}
                    <input
                      type="hidden"
                      name="exercise"
                      value={currentItem.prompt.exercise}
                    />
                    <input
                      type="hidden"
                      name="instruction"
                      value={currentItem.prompt.instruction}
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
                    <input type="hidden" name="kind" value="act" />
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
                        type={gradesLocally ? 'button' : 'submit'}
                        size="sm"
                        onClick={gradesLocally ? checkAnswer : undefined}
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
                          ? submittingLabel
                          : isComposition && currentAttempted
                            ? 'Revise & resubmit'
                            : submitLabel}
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

              {/* Spotting the right option and writing the fix are different
                  skills, so a self-directed session also asks the student to
                  produce the correction once the answer is checked. It is
                  extra drill, graded by the tutor rather than by index, and
                  never counts toward the set's progress. */}
              {allowRewrite && currentItem.kind !== 'composition' && grade ? (
                <RewriteBox
                  lessonSlug={currentItem.lessonSlug}
                  question={currentItem.question}
                />
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <Card className="shadow-none">
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <PartyPopper className="h-8 w-8 text-primary" />
              {doneCount >= problemCount ? (
                <>
                  <p className="text-lg font-semibold">{completionHeadline}</p>
                  <p className="max-w-[420px] text-base text-muted-foreground sm:text-sm">
                    {hasComposition
                      ? `All ${problemCount} problems mastered. Revisit any lesson from the practice library anytime.`
                      : `All ${problemCount} problems are done. You can revisit the lessons any time from the practice library.`}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {completionExtra}
                    <Button asChild size="sm" variant="outline">
                      <Link to={backTo}>{backLabel}</Link>
                    </Button>
                  </div>
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
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button size="sm" onClick={revisitUnfinished}>
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Keep going: {problemCount - masteredCount} to master
                    </Button>
                    {completionExtra}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* The refresher comes to the student: leaving for the lesson page
          mid-set costs them the problem they were on. */}
      {currentRecap ? (
        <Sheet open={isRecapOpen} onOpenChange={setRecapOpen}>
          <SheetContent
            data-testid="lesson-recap"
            className="w-full overflow-y-auto sm:max-w-xl"
          >
            <SheetHeader>
              <SheetTitle>{currentRecap.title}</SheetTitle>
              <SheetDescription>
                A quick refresher on the skill. Your place in the set is kept.
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-6">
              <LessonBody content={currentRecap.markdown} />
              <Button asChild variant="outline" size="sm">
                <Link
                  to={`/app/writing-lessons/${currentRecap.slug}?from=${encodeURIComponent(
                    reviewFrom
                  )}`}
                >
                  <BookOpen className="mr-2 h-4 w-4" />
                  Read the full lesson
                </Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </section>
  );
}

function formatDueDate(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * The "now write it yourself" box under a checked multiple-choice item: the
 * student produces the corrected sentence and the tutor responds.
 */
function RewriteBox({
  lessonSlug,
  question,
}: {
  lessonSlug: string;
  question: ActPracticeQuestion;
}) {
  const rewriteFetcher = useFetcher<RewriteCheckResult>();
  const [rewrite, setRewrite] = useState('');
  const isChecking = rewriteFetcher.state !== 'idle';
  // A late response for a question the student already moved past is ignored.
  const feedback =
    rewriteFetcher.data?.intent === 'check-rewrite' &&
    rewriteFetcher.data.questionId === question.id
      ? rewriteFetcher.data.feedback
      : null;

  return (
    <div
      data-testid="grammar-rewrite"
      className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Now write it yourself
        </p>
        <p className="mt-1 text-base leading-relaxed text-foreground sm:text-sm">
          {REWRITE_INSTRUCTION}
        </p>
      </div>

      <Textarea
        data-testid="grammar-rewrite-response"
        aria-label="Your rewritten sentence"
        value={rewrite}
        onChange={(event) => setRewrite(event.target.value)}
        placeholder="Type the corrected sentence here…"
        className="min-h-20 text-base sm:text-sm"
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        disabled={isChecking || rewrite.trim().length === 0}
        onClick={() => {
          if (isChecking || rewrite.trim().length === 0) return;
          rewriteFetcher.submit(
            {
              intent: 'check-rewrite',
              lessonSlug,
              questionId: question.id,
              exercise: question.sentence,
              instruction: REWRITE_INSTRUCTION,
              response: rewrite,
            },
            { method: 'post' }
          );
        }}
      >
        {isChecking ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <MessageSquareText className="mr-2 h-4 w-4" />
        )}
        Check my rewrite
      </Button>

      {feedback ? <PracticeFeedbackPanel feedback={feedback} /> : null}
    </div>
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
        <PracticeFeedbackPanel
          feedback={feedback}
          testId="assigned-composition-feedback"
        />
      </div>
    </div>
  );
}
