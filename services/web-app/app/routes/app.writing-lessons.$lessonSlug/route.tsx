import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RotateCcw,
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
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import {
  practiceFeedbackStatusLabel,
  type PracticeFeedbackResult,
} from '~/utils/writing-lessons/practice-feedback.shared';
import {
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
    practicePrompts: getQuickWritingPracticePrompts(params.lessonSlug),
    isTeacher,
    teacherClasses,
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
  const { lesson, practicePrompts, isTeacher, teacherClasses } =
    useLoaderData<typeof loader>();

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
          {isTeacher ? (
            <TeacherAssignPanel
              lessonSlug={lesson.slug}
              classes={teacherClasses}
              promptCount={practicePrompts.length}
            />
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
            <input type="hidden" name="promptId" value={activePrompt.id} />
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
                onChange={(event) => setResponse(event.currentTarget.value)}
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
