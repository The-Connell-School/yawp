import { ArrowLeft, CheckCircle2, Loader2, RotateCcw } from 'lucide-react';
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
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const lesson = getQuickWritingLessonBySlug(params.lessonSlug);
  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  return dataResponse({
    lesson,
    practicePrompts: getQuickWritingPracticePrompts(params.lessonSlug),
  });
}

type ActionData = {
  promptId: string;
  feedback: PracticeFeedbackResult;
};

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const context = getQuickWritingLessonContext(params.lessonSlug);
  if (!context) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const formData = await request.formData();
  const promptId = String(formData.get('promptId') ?? '');
  const response = String(formData.get('response') ?? '');

  const prompts = getQuickWritingPracticePrompts(params.lessonSlug);
  const prompt = prompts.find((item) => item.id === promptId);
  if (!prompt) {
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

  return dataResponse<ActionData>({ promptId: prompt.id, feedback });
}

const STATUS_STYLES: Record<PracticeFeedbackResult['status'], string> = {
  strong: 'bg-emerald-100 text-emerald-900',
  developing: 'bg-amber-100 text-amber-900',
  needs_revision: 'bg-rose-100 text-rose-900',
};

export default function WritingLessonDetailRoute() {
  const { lesson, practicePrompts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const [promptIndex, setPromptIndex] = useState(0);
  const [response, setResponse] = useState('');
  const activePrompt = practicePrompts[promptIndex] ?? null;
  const responseReady = response.trim().length > 0;
  const isChecking = fetcher.state !== 'idle';

  // Only show feedback that belongs to the prompt currently on screen, so
  // switching prompts never leaves stale feedback behind.
  const feedback =
    fetcher.data && fetcher.data.promptId === activePrompt?.id
      ? fetcher.data.feedback
      : null;

  function showNextPrompt() {
    if (practicePrompts.length === 0) return;
    setPromptIndex((current) => (current + 1) % practicePrompts.length);
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
              {lesson.category}
            </p>
            <h2 className="mt-1">{lesson.title}</h2>
            <p className="mt-3 max-w-full text-base text-muted-foreground sm:max-w-[620px] sm:text-sm">
              {lesson.description}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-screen-lg gap-6 px-3 py-6 pb-24 sm:px-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <MarkdownLesson content={lesson.content} />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <Card className="shadow-none">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-xl">Practice prompt</CardTitle>
                <Badge variant="secondary" size="sm">
                  {practicePrompts.length} prompts
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activePrompt ? (
                <fetcher.Form method="post" className="space-y-4">
                  <input
                    type="hidden"
                    name="promptId"
                    value={activePrompt.id}
                  />
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <p className="text-base text-foreground sm:text-sm">
                      {activePrompt.exercise}
                    </p>
                    <p className="mt-3 text-base text-muted-foreground sm:text-sm">
                      {activePrompt.instruction}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="practice-response"
                      className="text-base font-medium text-foreground sm:text-sm"
                    >
                      Your practice response
                    </label>
                    <Textarea
                      id="practice-response"
                      name="response"
                      value={response}
                      onChange={(event) =>
                        setResponse(event.currentTarget.value)
                      }
                      placeholder="Rewrite the sentence here."
                      className="min-h-28 text-base sm:text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
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
                      {isChecking ? 'Checking…' : 'Check response'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={showNextPrompt}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Try another prompt
                    </Button>
                  </div>

                  {feedback ? (
                    <PracticeFeedbackPanel feedback={feedback} />
                  ) : null}
                </fetcher.Form>
              ) : (
                <p className="text-base text-muted-foreground sm:text-sm">
                  This lesson does not have extracted practice prompts yet.
                </p>
              )}
            </CardContent>
          </Card>
        </aside>
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

function MarkdownLesson({ content }: { content: string }) {
  return (
    <article className="flex flex-col gap-3 text-base leading-7">
      {content.split('\n').map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={index} className="h-2" />;
        if (line === '---') return <hr key={index} className="my-3" />;
        if (line.startsWith('# ')) {
          return (
            <h3 key={index} className="mt-2 text-2xl font-semibold">
              {cleanMarkdown(line.slice(2))}
            </h3>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h4 key={index} className="mt-6 text-xl font-semibold">
              {cleanMarkdown(line.slice(3))}
            </h4>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h5 key={index} className="mt-4 text-lg font-semibold">
              {cleanMarkdown(line.slice(4))}
            </h5>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <p key={index} className="pl-4">
              <span aria-hidden="true">• </span>
              {cleanMarkdown(line.slice(2))}
            </p>
          );
        }

        return <p key={index}>{cleanMarkdown(line)}</p>;
      })}
    </article>
  );
}

function cleanMarkdown(value: string) {
  return value.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '');
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
