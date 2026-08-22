import {
  ArrowLeft,
  ClipboardCheck,
  Lightbulb,
  Loader2,
  MonitorPlay,
  PenLine,
  Play,
  Sparkles,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Link,
  data as dataResponse,
  redirect,
  useFetcher,
  useLoaderData,
  useSearchParams,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { LessonEvidencePanel } from '~/components/writing-lessons/lesson-evidence-panel';
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { formatClassLabel } from '~/utils/class-display';
import { prisma } from '~/utils/db.server';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';
import { COMPOSITION_TOPIC_SUGGESTIONS } from '~/utils/writing-lessons/composition-topic-prompts';
import type { LessonEvidence } from '~/utils/writing-lessons/lesson-evidence';
import { getLessonEvidenceForTeacher } from '~/utils/writing-lessons/lesson-evidence.server';
import {
  getLoungeModuleLinkForLesson,
  type LoungeModuleLink,
} from '~/utils/writing-lessons/lounge-links.server';
import {
  getQuickWritingLessonBody,
  getQuickWritingLessonBySlug,
  getQuickWritingPracticePrompts,
} from '~/utils/writing-lessons/static-lessons.server';
import { safeAssignedReturnPath } from '~/utils/writing-lessons/return-path';

type TeacherClass = {
  id: string;
  title: string | null;
  period: string | null;
  grade: string | null;
};

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  // Writing practice ships dark behind the org flag, so a direct lesson URL
  // has to bounce too — otherwise the feature leaks past the pause.
  if (!profile.organization.writingPracticeEnabled) {
    throw redirect('/app');
  }

  const lesson = getQuickWritingLessonBySlug(params.lessonSlug);
  if (!lesson) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const isComposition = lesson.section === 'Composition';
  // Composition is still behind its rollout flag: hide the lessons entirely
  // (even by direct URL) until it is switched on.
  if (isComposition && !isCompositionPracticeEnabled()) {
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

  // Composition skills are taught on video in the Teacher's Lounge; link
  // teachers straight to Brian's matching module. Null (student, grammar
  // lesson, or module absent in this environment) simply omits the link.
  const loungeModule: LoungeModuleLink | null =
    isComposition && isTeacher
      ? await getLoungeModuleLinkForLesson(lesson.slug, profile.id)
      : null;

  // The teacher's half of this page: what their own classes have done with
  // this skill. A student never gets this, and never gets anyone else's work.
  const evidence: LessonEvidence | null = isTeacher
    ? await getLessonEvidenceForTeacher(lesson.slug, profile.id)
    : null;

  return dataResponse({
    lesson,
    isComposition,
    lessonBody: getQuickWritingLessonBody(lesson.content),
    // For grammar this feeds the teacher assign panel's default problem count;
    // for composition these are the constructed-response prompts the panel
    // works through.
    practicePrompts: getQuickWritingPracticePrompts(params.lessonSlug),
    isTeacher,
    teacherClasses,
    loungeModule,
    evidence,
  });
}

export default function WritingLessonDetailRoute() {
  const {
    lesson,
    isComposition,
    lessonBody,
    practicePrompts,
    isTeacher,
    teacherClasses,
    loungeModule,
    evidence,
  } = useLoaderData<typeof loader>();

  // Grammar lessons drill ACT multiple choice; composition lessons are
  // constructed response graded by the tutor feedback service. Either way the
  // practice itself runs on the session screen, not here.
  const practicePanel = (
    <PracticeLaunchPanel
      lessonSlug={lesson.slug}
      isComposition={isComposition}
      isTeacher={isTeacher}
    />
  );

  // If the student opened this lesson to review it mid-practice, "Back to
  // practice" returns them to that exact exercise instead of the index.
  const [searchParams] = useSearchParams();
  const returnToAssignment = safeAssignedReturnPath(searchParams.get('from'));
  const backTo = returnToAssignment ?? '/app/writing-lessons';
  const backLabel = returnToAssignment
    ? 'Back to practice set'
    : 'Back to practice';

  return (
    <section className="no-scrollbar flex h-full w-full flex-col overflow-y-scroll">
      <div className="w-full border-b bg-secondary">
        <div className="mx-auto w-full max-w-screen-lg p-3 sm:p-5">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
            <Link to={backTo}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {backLabel}
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
            {/* The same lesson reads differently to the two audiences: a
                teacher is deciding whether to assign it, a student is about
                to practice it. */}
            {isTeacher ? (
              <p
                data-testid="lesson-teacher-intro"
                className="mt-3 max-w-[620px] text-pretty text-base text-muted-foreground sm:text-sm"
              >
                This is the lesson your students will read. Start the practice
                yourself to see the exact screen they work on, then assign it to
                your classes from the panel on the right.
              </p>
            ) : (
              <p
                data-testid="lesson-student-intro"
                className="mt-3 max-w-[620px] text-pretty text-base text-muted-foreground sm:text-sm"
              >
                {isComposition
                  ? 'Read the lesson, then start a practice set and write your own responses. You will get feedback on what is working and what to try next.'
                  : 'Read the lesson, then start a practice set on the right. This is practice, not graded work — your answers stay on your screen.'}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-screen-lg gap-8 px-3 py-8 pb-24 sm:px-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <LessonBody content={lessonBody} />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          {isTeacher ? (
            // Teachers get the assign panel plus the same way into practice
            // students have, so they can test-drive a lesson before assigning
            // it — on the screen their students will actually see.
            <div className="space-y-6">
              {loungeModule ? (
                <LoungeModuleCard loungeModule={loungeModule} />
              ) : null}
              {evidence ? (
                <LessonEvidencePanel
                  evidence={evidence}
                  isComposition={isComposition}
                />
              ) : null}
              <TeacherAssignPanel
                lessonSlug={lesson.slug}
                lessonTitle={lesson.title}
                classes={teacherClasses}
                promptCount={practicePrompts.length}
              />
              {practicePanel}
            </div>
          ) : (
            practicePanel
          )}
        </aside>
      </div>
    </section>
  );
}

function LoungeModuleCard({
  loungeModule,
}: {
  loungeModule: LoungeModuleLink;
}) {
  return (
    <Card className="shadow-none" data-testid="lounge-module-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MonitorPlay className="h-4 w-4 shrink-0 text-primary" />
          Watch Brian teach this
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-base sm:text-sm">
        <p className="text-muted-foreground">
          This skill is covered in{' '}
          <span className="font-medium text-foreground">
            {loungeModule.moduleTitle}
          </span>{' '}
          from {loungeModule.trainingTitle} — with the lesson plan and slide
          deck ready to download.
        </p>
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link
            to={`/app/teacher-trainings/${loungeModule.trainingId}/modules/${loungeModule.moduleId}`}
          >
            Open in the Teacher&rsquo;s Lounge
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * The way into practice from a lesson. A preview panel used to sit here, but
 * it was its own little screen — a different layout, different buttons, and
 * nothing a student could recognise from the practice their teacher assigns.
 * So this hands them the real thing instead: a button that builds a set and
 * drops them into the same runner an assignment uses.
 */
function PracticeLaunchPanel({
  lessonSlug,
  isComposition,
  isTeacher,
}: {
  lessonSlug: string;
  isComposition: boolean;
  isTeacher: boolean;
}) {
  const countOptions = isComposition ? [3, 5, 8] : [5, 10, 15];
  const [count, setCount] = useState(countOptions[0]);
  // Interest-driven practice: once the student names a topic, the set is built
  // around it instead of the standard prompts.
  const [topic, setTopic] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');

  const params = new URLSearchParams({
    skills: lessonSlug,
    count: String(count),
  });
  if (isComposition && topic) params.set('topic', topic);
  const startHref = `/app/writing-lessons/practice?${params.toString()}`;

  return (
    <Card className="overflow-hidden rounded-2xl border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/40 pb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <PenLine className="h-4 w-4" />
          </span>
          <CardTitle className="text-lg">
            {isTeacher ? 'Preview the practice' : 'Try it yourself'}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        <p className="text-base text-muted-foreground sm:text-sm">
          {isTeacher
            ? 'Work a set yourself on the exact screen your students get when you assign this lesson.'
            : isComposition
              ? 'Write your way through a set of prompts and get feedback on each one. It is the same screen as assigned practice — but nothing here is sent to your teacher.'
              : 'Work through a set of ACT-style questions, then write the fix yourself. It is the same screen as assigned practice — but nothing here is sent to your teacher.'}
        </p>

        {isComposition ? (
          topic ? (
            <div
              data-testid="composition-topic-active"
              className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm text-foreground">
                Practicing with <span className="font-medium">{topic}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 rounded-full px-2 text-xs text-muted-foreground"
                onClick={() => {
                  setTopic(null);
                  setTopicInput('');
                }}
              >
                Use standard prompts
              </Button>
            </div>
          ) : (
            <div
              data-testid="composition-topic-picker"
              className="space-y-2 rounded-xl border border-dashed border-border/70 p-3"
            >
              <p className="text-sm font-medium text-foreground">
                Make it about you
              </p>
              <p className="text-sm text-muted-foreground">
                Pick something you care about and the prompts will be built
                around it.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {COMPOSITION_TOPIC_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => setTopic(suggestion)}
                    className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  data-testid="composition-topic-input"
                  aria-label="Your own topic"
                  value={topicInput}
                  onChange={(event) => setTopicInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      if (topicInput.trim()) setTopic(topicInput.trim());
                    }
                  }}
                  placeholder="…or your own topic"
                  className="h-8 text-base sm:text-sm"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 rounded-full"
                  disabled={topicInput.trim().length === 0}
                  onClick={() => setTopic(topicInput.trim())}
                >
                  Make it mine
                </Button>
              </div>
            </div>
          )
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How many problems
          </p>
          <div className="flex flex-wrap gap-1.5" role="group">
            {countOptions.map((option) => (
              <Button
                key={option}
                type="button"
                size="sm"
                variant={option === count ? 'default' : 'outline'}
                aria-pressed={option === count}
                className="h-8 w-12 rounded-full"
                onClick={() => setCount(option)}
              >
                {option}
              </Button>
            ))}
          </div>
        </div>

        <Button asChild className="w-full rounded-full">
          <Link data-testid="start-practice" to={startHref}>
            <Play className="mr-2 h-4 w-4" />
            {isTeacher ? 'Try the practice' : 'Start practice'}
          </Link>
        </Button>
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
  return formatClassLabel(cls);
}

function TeacherAssignPanel({
  lessonSlug,
  lessonTitle,
  classes,
  promptCount,
}: {
  lessonSlug: string;
  lessonTitle: string;
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

            <div className="space-y-2">
              <label
                htmlFor="assignmentTitle"
                className="text-base font-medium text-foreground sm:text-sm"
              >
                Assignment title
              </label>
              <input
                id="assignmentTitle"
                name="title"
                type="text"
                defaultValue={`${lessonTitle} practice`}
                required
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm"
              />
            </div>

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
                Due date
              </label>
              <input
                id="dueAt"
                name="dueAt"
                type="date"
                required
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
