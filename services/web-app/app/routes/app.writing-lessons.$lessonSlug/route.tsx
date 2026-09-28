import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { useState } from 'react';
import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import {
  getPracticeSelfCheck,
  type PracticeSelfCheck,
} from '~/utils/writing-lessons/practice-self-check';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  const lesson = getQuickWritingLessonBySlug(params.lessonSlug);
  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  return dataResponse({
    lesson,
    practicePrompts: getQuickWritingPracticePrompts(params.lessonSlug),
  });
}

export default function WritingLessonDetailRoute() {
  const { lesson, practicePrompts } = useLoaderData<typeof loader>();
  const [promptIndex, setPromptIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [selfCheck, setSelfCheck] = useState<PracticeSelfCheck | null>(null);
  const activePrompt = practicePrompts[promptIndex] ?? null;
  const responseReady = response.trim().length > 0;

  function checkResponse() {
    if (!activePrompt) return;
    setSelfCheck(getPracticeSelfCheck(response, activePrompt.exercise));
  }

  function showNextPrompt() {
    if (practicePrompts.length === 0) return;
    setPromptIndex((current) => (current + 1) % practicePrompts.length);
    setResponse('');
    setSelfCheck(null);
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
                <>
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
                      name="practice-response"
                      value={response}
                      onChange={(event) => {
                        setResponse(event.currentTarget.value);
                        setSelfCheck(null);
                      }}
                      placeholder="Rewrite the sentence here."
                      className="min-h-28 text-base sm:text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={checkResponse}
                      disabled={!responseReady}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Check response
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

                  {selfCheck ? (
                    <div className="rounded-lg border bg-card p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-base font-medium sm:text-sm">
                          Self-check
                        </p>
                        <Badge variant="secondary" size="sm">
                          {selfCheck.wordCount}{' '}
                          {selfCheck.wordCount === 1 ? 'word' : 'words'}
                        </Badge>
                      </div>
                      <ul className="mt-3 space-y-2">
                        {selfCheck.checks.map((check) => (
                          <li
                            key={check.id}
                            className="flex items-start gap-2 text-base text-muted-foreground sm:text-sm"
                          >
                            {check.status === 'ok' ? (
                              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                            <span>{check.label}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 border-t pt-3 text-base text-muted-foreground sm:text-sm">
                        This check looks at punctuation and word choice only. It
                        is not a grade, and it does not tell you whether your
                        writing is correct.
                      </p>
                    </div>
                  ) : null}
                </>
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
