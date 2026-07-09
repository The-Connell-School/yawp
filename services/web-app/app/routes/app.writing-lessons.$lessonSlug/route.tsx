import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Lightbulb,
  Loader2,
  PenLine,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Link,
  data as dataResponse,
  useFetcher,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { PracticePrompt } from '~/components/writing-lessons/practice-prompt';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import { generatePracticePrompts } from '~/utils/writing-lessons/practice-prompt-generation.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';
import {
  getQuickWritingLessonBody,
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingPracticePrompts,
  type QuickWritingPracticePrompt,
} from '~/utils/writing-lessons/static-lessons.server';

type TeacherClass = {
  id: string;
  title: string | null;
  period: string;
  grade: string;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  const lesson = getQuickWritingLessonBySlug(params.lessonSlug);
  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const isTeacher = profile.role === 'TEACHER';
  const teacherClasses: TeacherClass[] = isTeacher
    ? await prisma.class.findMany({
        where: { teachers: { some: { id: profile.id } }, isArchived: false },
        select: { id: true, title: true, period: true, grade: true },
        orderBy: [{ grade: 'asc' }, { period: 'asc' }],
      })
    : [];

  return dataResponse({
    lesson,
    lessonBody: getQuickWritingLessonBody(lesson.content),
    practicePrompts: getQuickWritingPracticePrompts(params.lessonSlug),
    isTeacher,
    teacherClasses,
  });
}

type CheckActionData = {
  promptId: string;
  feedback: PracticeFeedbackResult;
};

type GenerateActionData = {
  intent: 'generate';
  prompts: QuickWritingPracticePrompt[];
};

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const context = getQuickWritingLessonContext(params.lessonSlug);
  if (!context) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? 'check');
  const staticPrompts = getQuickWritingPracticePrompts(params.lessonSlug);

  // Self-serve students can keep drilling a skill indefinitely: once they work
  // through the static bank we generate fresh AI items grounded in the same
  // rule and examples, so the panel never runs dry.
  if (intent === 'generate') {
    const requested = Number(formData.get('count') ?? 5);
    const count = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), 8)
      : 5;
    const generated = await generatePracticePrompts({
      skill: context.skill,
      lessonTitle: context.title,
      rule: context.rule,
      exampleExercises: staticPrompts.slice(0, 3).map((item) => item.exercise),
      count,
    });
    const prompts: QuickWritingPracticePrompt[] = generated.map((item) => ({
      id: `${params.lessonSlug}-gen-${crypto.randomUUID()}`,
      exercise: item.exercise,
      instruction: item.instruction,
    }));
    return dataResponse<GenerateActionData>({ intent: 'generate', prompts });
  }

  const promptId = String(formData.get('promptId') ?? '');
  const response = String(formData.get('response') ?? '');

  // Prefer the trusted static prompt when the id is one of ours; otherwise the
  // prompt was AI-generated on the client, so use the exercise it carries. The
  // feedback itself is always grounded server-side in the lesson's rule/skill.
  const staticPrompt = staticPrompts.find((item) => item.id === promptId);
  const exercise = staticPrompt?.exercise ?? String(formData.get('exercise') ?? '');
  const instruction =
    staticPrompt?.instruction ?? String(formData.get('instruction') ?? '');
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

export default function WritingLessonDetailRoute() {
  const { lesson, lessonBody, practicePrompts, isTeacher, teacherClasses } =
    useLoaderData<typeof loader>();

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="w-full border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
            <Link to="/app/writing-lessons">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to practice
            </Link>
          </Button>
          <div className="flex flex-col">
            <Badge
              variant="secondary"
              size="sm"
              className="w-fit uppercase tracking-wide"
            >
              {lesson.category}
            </Badge>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              {lesson.title}
            </h2>
            <p className="mt-2 max-w-[620px] text-base text-muted-foreground sm:text-sm">
              {lesson.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-screen-lg gap-8 px-3 py-8 pb-24 sm:px-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <LessonBody content={lessonBody} />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {isTeacher ? (
            // Teachers get the assign panel plus the same "Try it yourself"
            // practice students see, so they can test-drive a lesson before
            // assigning it.
            <div className="space-y-6">
              <TeacherAssignPanel
                lessonSlug={lesson.slug}
                classes={teacherClasses}
                promptCount={practicePrompts.length}
              />
              <StudentPracticePanel practicePrompts={practicePrompts} />
            </div>
          ) : (
            <StudentPracticePanel practicePrompts={practicePrompts} />
          )}
        </aside>
      </div>
    </section>
  );
}

function StudentPracticePanel({
  practicePrompts,
}: {
  practicePrompts: QuickWritingPracticePrompt[];
}) {
  const fetcher = useFetcher<CheckActionData>();
  const generateFetcher = useFetcher<GenerateActionData>();
  const [extraPrompts, setExtraPrompts] = useState<
    QuickWritingPracticePrompt[]
  >([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [response, setResponse] = useState('');

  // Static bank first (instant), then fresh AI items appended as the student
  // works through them, so the well never runs dry.
  const allPrompts = [...practicePrompts, ...extraPrompts];
  const activePrompt = allPrompts[promptIndex] ?? null;
  const responseReady = response.trim().length > 0;
  const isChecking = fetcher.state !== 'idle';
  const isGenerating = generateFetcher.state !== 'idle';

  // Only show feedback that belongs to the prompt currently on screen, so
  // switching prompts never leaves stale feedback behind.
  const feedback =
    fetcher.data && fetcher.data.promptId === activePrompt?.id
      ? fetcher.data.feedback
      : null;

  // Append freshly generated prompts, skipping any ids we already hold.
  useEffect(() => {
    const generated = generateFetcher.data;
    if (generated?.intent !== 'generate' || generated.prompts.length === 0) {
      return;
    }
    setExtraPrompts((current) => {
      const seen = new Set([
        ...practicePrompts.map((item) => item.id),
        ...current.map((item) => item.id),
      ]);
      const fresh = generated.prompts.filter((item) => !seen.has(item.id));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
  }, [generateFetcher.data, practicePrompts]);

  function requestMorePrompts() {
    if (isGenerating) return;
    generateFetcher.submit(
      { intent: 'generate', count: '5' },
      { method: 'post' }
    );
  }

  function showNextPrompt() {
    if (allPrompts.length === 0) return;
    const nextIndex = promptIndex + 1;
    // Pull a fresh batch before the student reaches the end of what's loaded.
    if (nextIndex >= allPrompts.length - 2) {
      requestMorePrompts();
    }
    // Advance if a next prompt is loaded; otherwise wrap so it never dead-ends
    // while the next batch is still generating.
    setPromptIndex(nextIndex < allPrompts.length ? nextIndex : 0);
    setResponse('');
  }

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/40 pb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <PenLine className="h-4 w-4" />
            </span>
            <CardTitle className="text-lg">Try it yourself</CardTitle>
          </div>
          {activePrompt ? (
            <span className="text-xs font-medium text-muted-foreground">
              Prompt {promptIndex + 1}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {activePrompt ? (
          <fetcher.Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="check" />
            <input type="hidden" name="promptId" value={activePrompt.id} />
            <input type="hidden" name="exercise" value={activePrompt.exercise} />
            <input
              type="hidden"
              name="instruction"
              value={activePrompt.instruction}
            />
            <PracticePrompt
              exercise={activePrompt.exercise}
              instruction={activePrompt.instruction}
            />

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
                onKeyDown={(event) => {
                  // Enter checks the answer; Shift+Enter still adds a newline.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (responseReady && !isChecking) {
                      event.currentTarget.form?.requestSubmit();
                    }
                  }
                }}
                placeholder="Rewrite the sentence here…"
                className="min-h-32 resize-none rounded-xl text-base leading-relaxed sm:text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Press{' '}
                <kbd className="rounded border bg-muted px-1 font-sans">
                  Enter
                </kbd>{' '}
                to check ·{' '}
                <kbd className="rounded border bg-muted px-1 font-sans">
                  Shift + Enter
                </kbd>{' '}
                for a new line
              </p>
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
                onClick={showNextPrompt}
              >
                {isGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                New prompt
              </Button>
            </div>

            {feedback ? <PracticeFeedbackPanel feedback={feedback} /> : null}
          </fetcher.Form>
        ) : (
          <p className="text-base text-muted-foreground sm:text-sm">
            This lesson does not have extracted practice prompts yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

type AssignResult = {
  success: boolean;
  message: string;
  classCount?: number;
};

function classLabel(cls: TeacherClass): string {
  if (cls.title && cls.title.trim().length > 0) return cls.title;
  return `Grade ${cls.grade} · Period ${cls.period}`;
}

function TeacherAssignPanel({
  lessonSlug,
  classes,
  promptCount,
}: {
  lessonSlug: string;
  classes: TeacherClass[];
  promptCount: number;
}) {
  const fetcher = useFetcher<AssignResult>();
  const isSubmitting = fetcher.state !== 'idle';
  const result = fetcher.data;
  const defaultProblemCount = Math.min(promptCount || 5, 5) || 1;

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          <CardTitle className="text-xl">Assign to your classes</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {classes.length === 0 ? (
          <p className="text-base text-muted-foreground sm:text-sm">
            You are not listed as a teacher on any active class yet, so there is
            nowhere to assign this practice.
          </p>
        ) : (
          <fetcher.Form
            method="post"
            action="/app/writing-lessons/assign"
            className="space-y-4"
          >
            <input type="hidden" name="lessonSlugs" value={lessonSlug} />

            <fieldset className="space-y-2">
              <legend className="text-base font-medium text-foreground sm:text-sm">
                Classes
              </legend>
              <div className="space-y-1.5">
                {classes.map((cls) => (
                  <label
                    key={cls.id}
                    className="flex items-center gap-2 text-base sm:text-sm"
                  >
                    <input
                      type="checkbox"
                      name="classIds"
                      value={cls.id}
                      className="h-4 w-4 rounded border-input"
                    />
                    <span>{classLabel(cls)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="space-y-2">
              <label
                htmlFor="problemCount"
                className="text-base font-medium text-foreground sm:text-sm"
              >
                Number of problems
              </label>
              <input
                id="problemCount"
                name="problemCount"
                type="number"
                min={1}
                max={20}
                defaultValue={defaultProblemCount}
                className="h-9 w-24 rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="dueAt"
                className="text-base font-medium text-foreground sm:text-sm"
              >
                Due date{' '}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <input
                id="dueAt"
                name="dueAt"
                type="date"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="instructions"
                className="text-base font-medium text-foreground sm:text-sm"
              >
                Instructions{' '}
                <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                id="instructions"
                name="instructions"
                placeholder="A note your students will see with this practice."
                className="min-h-20 text-base sm:text-sm"
              />
            </div>

            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ClipboardCheck className="mr-2 h-4 w-4" />
              )}
              {isSubmitting ? 'Assigning…' : 'Assign practice'}
            </Button>

            {result ? (
              <p
                data-testid="assign-result"
                className={`text-base sm:text-sm ${
                  result.success ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {result.message}
              </p>
            ) : null}
          </fetcher.Form>
        )}
      </CardContent>
    </Card>
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
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            What worked
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {feedback.strengths.map((item) => (
              <li key={item} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.focus.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Focus next on
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {feedback.focus.map((item) => (
              <li key={item} className="flex gap-2">
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-border/60 pt-2 text-sm italic text-muted-foreground">
        {feedback.encouragement}
      </p>
    </div>
  );
}

/**
 * Renders a lesson's teaching content with real structure: section headings,
 * before/after example cards, and a highlighted Quick Tip — instead of a flat
 * wall of stripped-markdown paragraphs.
 */
function LessonBody({ content }: { content: string }) {
  const blocks = content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return (
    <article className="max-w-[68ch] space-y-6">
      {blocks.map((block, index) => (
        <LessonBlock key={index} block={block} />
      ))}
    </article>
  );
}

function LessonBlock({ block }: { block: string }) {
  const lines = block.split('\n').map((line) => line.trim());
  const first = lines[0] ?? '';

  // The top-level "# Title" is already shown in the page header.
  if (first.startsWith('# ') && lines.length === 1) return null;
  if (block === '---') return null;

  // Before/after example blocks become tinted cards.
  if (lines.some((line) => /^-\s*(❌|✅|⚠️)/.test(line))) {
    return <ExampleCard lines={lines} />;
  }

  if (first.startsWith('## ')) {
    const heading = stripInlineMarks(first.slice(3));
    const rest = lines.slice(1).join('\n').trim();
    if (/quick tip/i.test(heading)) {
      return (
        <div className="flex gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="space-y-1.5">
            <p className="font-semibold text-foreground">{heading}</p>
            <Prose text={rest} />
          </div>
        </div>
      );
    }
    return (
      <section className="space-y-2.5">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">
          {heading}
        </h3>
        {rest ? <Prose text={rest} /> : null}
      </section>
    );
  }

  if (first.startsWith('### ')) {
    const heading = stripInlineMarks(first.slice(4));
    const rest = lines.slice(1).join('\n').trim();
    return (
      <section className="space-y-2">
        <h4 className="text-base font-semibold text-foreground">{heading}</h4>
        {rest ? <Prose text={rest} /> : null}
      </section>
    );
  }

  return <Prose text={block} />;
}

function ExampleCard({ lines }: { lines: string[] }) {
  const titleLine = lines.find((line) => /^\*\*Example/i.test(line));
  const title = titleLine
    ? stripInlineMarks(titleLine).replace(/:$/, '')
    : 'Example';
  const rows = lines.filter((line) => line.startsWith('- '));

  return (
    <div className="space-y-2 rounded-2xl border border-border/70 bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <ExampleRow key={index} row={row} />
        ))}
      </div>
    </div>
  );
}

function ExampleRow({ row }: { row: string }) {
  const body = row.replace(/^-\s*/, '');

  const whyMatch = body.match(/^\*?Why:\*?\s*(.*)$/i);
  if (whyMatch) {
    return (
      <p className="flex gap-2 pt-1 text-sm text-muted-foreground">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <span>
          <span className="font-medium text-foreground">Why: </span>
          {renderInline(whyMatch[1])}
        </span>
      </p>
    );
  }

  const emojiMatch = body.match(/^(❌|✅|⚠️)\s*(.*)$/);
  if (emojiMatch) {
    const [, emoji, rest] = emojiMatch;
    const tone =
      emoji === '✅'
        ? 'border-emerald-200 bg-emerald-50'
        : emoji === '❌'
          ? 'border-rose-200 bg-rose-50'
          : 'border-amber-200 bg-amber-50';
    return (
      <div className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${tone}`}>
        <span aria-hidden="true">{emoji}</span>
        <p className="leading-relaxed text-foreground">{renderInline(rest)}</p>
      </div>
    );
  }

  return <p className="text-sm leading-relaxed">{renderInline(body)}</p>;
}

function Prose({ text }: { text: string }) {
  const lines = text.split('\n').map((line) => line.trim());
  const nodes: ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    nodes.push(
      <ul
        key={`ul-${nodes.length}`}
        className="ml-1 space-y-1.5 border-l-2 border-border pl-4 text-[15px] leading-relaxed text-muted-foreground"
      >
        {items.map((item, index) => (
          <li key={index}>{renderInline(item)}</li>
        ))}
      </ul>
    );
  };

  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('- ')) {
      bullets.push(line.slice(2));
      continue;
    }
    flushBullets();
    nodes.push(
      <p
        key={`p-${nodes.length}`}
        className="text-[15px] leading-relaxed text-muted-foreground"
      >
        {renderInline(line)}
      </p>
    );
  }
  flushBullets();

  return <div className="space-y-3">{nodes}</div>;
}

/** Renders inline **bold**, *italic*, and `code`, stripping the markers. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key++}
          className="rounded bg-muted px-1 py-0.5 text-[0.85em] text-foreground"
        >
          {token.slice(1, -1)}
        </code>
      );
    } else {
      nodes.push(<em key={key++}>{token.slice(1, -1)}</em>);
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

function stripInlineMarks(value: string): string {
  return value.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '').trim();
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
