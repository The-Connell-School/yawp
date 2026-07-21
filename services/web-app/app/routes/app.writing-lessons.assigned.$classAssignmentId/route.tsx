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
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { ActPracticeQuestionView } from '~/components/writing-lessons/act-practice-question';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import {
  gradeActAnswer,
  type ActGradeResult,
} from '~/utils/writing-lessons/act-practice.shared';
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
  const { title, instructions, dueAt, problemCount, sequence, completedCount } =
    useLoaderData<typeof loader>();

  const fetcher = useFetcher<AssignedActionData>();
  const [pointer, setPointer] = useState(
    Math.min(completedCount, sequence.length)
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [writtenResponse, setWrittenResponse] = useState('');
  const [sessionAnswered, setSessionAnswered] = useState<number[]>([]);

  const currentItem = sequence[pointer] ?? null;
  const isChecking = fetcher.state !== 'idle';

  const currentResult =
    fetcher.data && fetcher.data.position === currentItem?.position
      ? fetcher.data
      : null;
  const grade = currentResult?.kind === 'act' ? currentResult.grade : null;
  const compositionFeedback =
    currentResult?.kind === 'composition' ? currentResult.feedback : null;
  const currentAnswered = currentResult?.recorded === true;

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
    setSelectedIndex(null);
    setWrittenResponse('');
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
            <h2 className="mt-1">{title ?? 'Writing Fundamentals Practice'}</h2>
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

                {currentItem.kind === 'composition' ? (
                  <>
                    <input type="hidden" name="kind" value="composition" />
                    <input
                      type="hidden"
                      name="promptId"
                      value={currentItem.prompt.id}
                    />
                    <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Your prompt
                      </p>
                      <p className="mt-2 text-base leading-relaxed text-foreground">
                        {currentItem.prompt.exercise}
                      </p>
                      <p className="mt-3 text-sm font-medium text-foreground">
                        {currentItem.prompt.instruction}
                      </p>
                    </div>
                    <Textarea
                      name="response"
                      data-testid="assigned-composition-response"
                      aria-label="Your response"
                      value={writtenResponse}
                      onChange={(event) =>
                        setWrittenResponse(event.target.value)
                      }
                      readOnly={currentAnswered}
                      placeholder="Write your response here…"
                      className="min-h-28 text-base sm:text-sm"
                    />
                    {compositionFeedback ? (
                      <AssignedCompositionFeedback
                        feedback={compositionFeedback}
                      />
                    ) : null}
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

                <div className="flex flex-wrap gap-2">
                  {!currentAnswered ? (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        isChecking ||
                        (currentItem.kind === 'composition'
                          ? writtenResponse.trim().length === 0
                          : selectedIndex === null)
                      }
                    >
                      {isChecking ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                      )}
                      {isChecking ? 'Saving…' : 'Check & save'}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" onClick={goNext}>
                      {pointer + 1 >= problemCount ? 'Finish' : 'Next problem'}
                    </Button>
                  )}
                </div>
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
