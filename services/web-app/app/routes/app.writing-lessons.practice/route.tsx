import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PenLine,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { buildAssignedPracticeSequence } from '~/utils/writing-lessons/practice-assignments.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import { generatePracticePrompts } from '~/utils/writing-lessons/practice-prompt-generation.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

const MAX_PROBLEMS = 20;

function parseSkills(raw: string | null): string[] {
  return (raw ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
    .filter((slug) => Boolean(getQuickWritingLessonBySlug(slug)));
}

function clampCount(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 5;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_PROBLEMS);
}

// A self-directed practice session: the student picks the skills and how many
// problems, and we build an interleaved set from the selected skills. Nothing
// is persisted — this is on-the-fly practice, endless via AI top-ups.
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const url = new URL(request.url);
  const skills = parseSkills(url.searchParams.get('skills'));
  const count = clampCount(url.searchParams.get('count'));

  if (skills.length === 0) {
    return redirect('/app/writing-lessons');
  }

  const sequence = buildAssignedPracticeSequence(skills, count);
  const skillTitles = skills.map(
    (slug) => getQuickWritingLessonBySlug(slug)?.title ?? slug
  );

  return dataResponse({ sequence, skills, skillTitles, count });
}

type CheckActionData = {
  promptId: string;
  feedback: PracticeFeedbackResult;
};

type GeneratedPromptItem = {
  id: string;
  lessonSlug: string;
  lessonTitle: string;
  exercise: string;
  instruction: string;
};

type GenerateActionData = {
  intent: 'generate';
  prompts: GeneratedPromptItem[];
};

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? 'check');
  const lessonSlug = String(formData.get('lessonSlug') ?? '');
  const context = getQuickWritingLessonContext(lessonSlug);
  if (!context) {
    throw new Response('Unknown practice skill', { status: 400 });
  }

  if (intent === 'generate') {
    const requested = Number(formData.get('count') ?? 3);
    const count = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), 6)
      : 3;
    const staticPrompts = getQuickWritingPracticePrompts(lessonSlug);
    const generated = await generatePracticePrompts({
      skill: context.skill,
      lessonTitle: context.title,
      rule: context.rule,
      exampleExercises: staticPrompts.slice(0, 3).map((item) => item.exercise),
      count,
    });
    const prompts: GeneratedPromptItem[] = generated.map((item) => ({
      id: `${lessonSlug}-gen-${crypto.randomUUID()}`,
      lessonSlug,
      lessonTitle: context.title,
      exercise: item.exercise,
      instruction: item.instruction,
    }));
    return dataResponse<GenerateActionData>({ intent: 'generate', prompts });
  }

  const promptId = String(formData.get('promptId') ?? '');
  const response = String(formData.get('response') ?? '');
  const exercise = String(formData.get('exercise') ?? '');
  const instruction = String(formData.get('instruction') ?? '');
  if (!promptId || !exercise) {
    throw new Response('Unknown practice prompt', { status: 400 });
  }

  const feedback = await generatePracticeFeedback({
    lessonTitle: context.title,
    skill: context.skill,
    rule: context.rule,
    exercise,
    instruction,
    response,
  });

  return dataResponse<CheckActionData>({ promptId, feedback });
}

const STATUS_STYLES: Record<PracticeFeedbackResult['status'], string> = {
  strong: 'bg-emerald-100 text-emerald-900',
  developing: 'bg-amber-100 text-amber-900',
  needs_revision: 'bg-rose-100 text-rose-900',
};

type SessionItem = {
  id: string;
  lessonSlug: string;
  lessonTitle: string;
  exercise: string;
  instruction: string;
};

export default function WritingPracticeSessionRoute() {
  const { sequence, skills, skillTitles } = useLoaderData<typeof loader>();

  const initialItems: SessionItem[] = sequence.map((item) => ({
    id: item.prompt.id,
    lessonSlug: item.lessonSlug,
    lessonTitle: item.lessonTitle,
    exercise: item.prompt.exercise,
    instruction: item.prompt.instruction,
  }));

  const checkFetcher = useFetcher<CheckActionData>();
  const generateFetcher = useFetcher<GenerateActionData>();

  const [items, setItems] = useState<SessionItem[]>(initialItems);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  // Round-robin over the selected skills when topping up the session.
  const [nextSkill, setNextSkill] = useState(0);

  const active = items[index] ?? null;
  const responseReady = response.trim().length > 0;
  const isChecking = checkFetcher.state !== 'idle';
  const isGenerating = generateFetcher.state !== 'idle';

  const feedback =
    checkFetcher.data && checkFetcher.data.promptId === active?.id
      ? checkFetcher.data.feedback
      : null;

  useEffect(() => {
    const generated = generateFetcher.data;
    if (generated?.intent !== 'generate' || generated.prompts.length === 0) {
      return;
    }
    setItems((current) => {
      const seen = new Set(current.map((item) => item.id));
      const fresh = generated.prompts.filter((item) => !seen.has(item.id));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
  }, [generateFetcher.data]);

  function requestMore() {
    if (isGenerating || skills.length === 0) return;
    const slug = skills[nextSkill % skills.length];
    setNextSkill((current) => current + 1);
    generateFetcher.submit(
      { intent: 'generate', lessonSlug: slug, count: '4' },
      { method: 'post' }
    );
  }

  function showNext() {
    if (items.length === 0) return;
    const next = index + 1;
    if (next >= items.length - 2) {
      requestMore();
    }
    setIndex(next < items.length ? next : 0);
    setResponse('');
  }

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="w-full border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-md p-3 sm:p-5">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
            <Link to="/app/writing-lessons">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to practice
            </Link>
          </Button>
          <p className="text-base font-medium text-primary sm:text-sm">
            Your practice
          </p>
          <h2 className="mt-1">Grammar practice</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {skillTitles.map((title) => (
              <Badge key={title} variant="secondary" size="sm">
                {title}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-screen-md px-3 py-8 pb-24 sm:px-5">
        <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
          <CardHeader className="border-b bg-muted/40 pb-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <PenLine className="h-4 w-4" />
                </span>
                <CardTitle className="text-lg">Try it yourself</CardTitle>
              </div>
              {active ? (
                <span className="text-xs font-medium text-muted-foreground">
                  Problem {index + 1}
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-5">
            {active ? (
              <checkFetcher.Form method="post" className="space-y-4">
                <input type="hidden" name="intent" value="check" />
                <input type="hidden" name="promptId" value={active.id} />
                <input type="hidden" name="lessonSlug" value={active.lessonSlug} />
                <input type="hidden" name="exercise" value={active.exercise} />
                <input
                  type="hidden"
                  name="instruction"
                  value={active.instruction}
                />

                <div className="space-y-2 rounded-xl border border-border/70 bg-background p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Rewrite this
                    </p>
                    <Badge variant="outline" size="sm">
                      {active.lessonTitle}
                    </Badge>
                  </div>
                  <p className="text-base font-medium leading-relaxed text-foreground">
                    {active.exercise}
                  </p>
                  <p className="flex items-start gap-1.5 pt-1 text-sm text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    {active.instruction}
                  </p>
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="practice-response"
                    className="text-sm font-medium text-foreground"
                  >
                    Your answer
                  </label>
                  <Textarea
                    id="practice-response"
                    name="response"
                    value={response}
                    onChange={(event) => setResponse(event.currentTarget.value)}
                    placeholder="Rewrite the sentence here…"
                    className="min-h-32 resize-none rounded-xl text-base leading-relaxed sm:text-sm"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="submit"
                    className="rounded-full"
                    disabled={!responseReady || isChecking}
                  >
                    {isChecking ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    {isChecking ? 'Checking…' : 'Check my answer'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="rounded-full text-muted-foreground"
                    onClick={showNext}
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Next problem
                  </Button>
                </div>

                {feedback ? (
                  <div
                    data-testid="practice-feedback"
                    className="space-y-3 rounded-xl border border-border/70 bg-muted/30 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[feedback.status]}`}
                      >
                        {practiceFeedbackStatusLabel(feedback.status)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {feedback.degraded ? 'Quick self-check' : 'Tutor feedback'}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">
                      {feedback.summary}
                    </p>
                    {feedback.strengths.length > 0 ? (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {feedback.strengths.map((strength) => (
                          <li key={strength} className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            <span>{strength}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {feedback.focus.length > 0 ? (
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {feedback.focus.map((focusItem) => (
                          <li key={focusItem} className="flex gap-2">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <span>{focusItem}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="border-t border-border/60 pt-2 text-sm italic text-muted-foreground">
                      {feedback.encouragement}
                    </p>
                  </div>
                ) : null}
              </checkFetcher.Form>
            ) : (
              <p className="text-base text-muted-foreground sm:text-sm">
                This practice set is empty. Pick a skill to start.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
