import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Lightbulb,
  Loader2,
  MessageSquareText,
  MonitorPlay,
  PenLine,
  RotateCcw,
  Sparkles,
  XCircle,
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
import { Button } from '~/components/ui/button';
import { Badge } from '~/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Textarea } from '~/components/ui/textarea';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import { getActPracticeQuestions } from '~/utils/writing-lessons/act-practice-bank';
import { generateActPracticeQuestions } from '~/utils/writing-lessons/act-practice-generation.server';
import {
  NO_CHANGE_LABEL,
  gradeActAnswer,
  splitAroundUnderline,
  type ActGradeResult,
  type ActPracticeQuestion,
} from '~/utils/writing-lessons/act-practice.shared';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';
import {
  COMPOSITION_TOPIC_SUGGESTIONS,
  buildTopicFallbackPrompts,
  sanitizeCompositionTopic,
} from '~/utils/writing-lessons/composition-topic-prompts';
import {
  getLoungeModuleLinkForLesson,
  type LoungeModuleLink,
} from '~/utils/writing-lessons/lounge-links.server';
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

  return dataResponse({
    lesson,
    isComposition,
    lessonBody: getQuickWritingLessonBody(lesson.content),
    // For grammar this feeds the teacher assign panel's default problem count;
    // for composition these are the constructed-response prompts the panel
    // works through.
    practicePrompts: getQuickWritingPracticePrompts(params.lessonSlug),
    // The offline ACT bank powers the grammar "Try it yourself" panel and is
    // the fallback whenever AI generation is unavailable. Composition lessons
    // have no ACT bank (they are constructed response), so this is empty.
    actQuestions: getActPracticeQuestions(params.lessonSlug),
    isTeacher,
    teacherClasses,
    loungeModule,
  });
}

type ActGenerateActionData = {
  intent: 'generate-act';
  questions: ActPracticeQuestion[];
};

type CompositionCheckActionData = {
  intent: 'check-composition';
  promptId: string;
  feedback: PracticeFeedbackResult;
};

type CompositionPersonalizeActionData = {
  intent: 'personalize-composition';
  ok: boolean;
  /** Set when ok is false: why the topic was declined. */
  message?: string;
  topic?: string;
  /** 'ai' when the model generated the set, 'template' for the offline fallback. */
  source?: 'ai' | 'template';
  prompts?: QuickWritingPracticePrompt[];
};

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const context = getQuickWritingLessonContext(params.lessonSlug);
  if (!context) {
    throw new Response('Lesson not found', { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');

  // Composition lessons are constructed response: the student writes a topic
  // sentence / thesis and the tutor feedback service (grounded in the lesson's
  // skill + rule) responds. It degrades to a deterministic self-check when the
  // tutor is unavailable, so this works with no ANTHROPIC_API_KEY too.
  if (intent === 'check-composition') {
    if (!isCompositionPracticeEnabled()) {
      throw new Response('Composition practice is not enabled', {
        status: 400,
      });
    }
    const feedback = await generatePracticeFeedback({
      lessonTitle: context.title,
      skill: context.skill,
      rule: context.rule,
      exercise: String(formData.get('exercise') ?? ''),
      instruction: String(formData.get('instruction') ?? ''),
      response: String(formData.get('response') ?? ''),
    });
    return dataResponse<CompositionCheckActionData>({
      intent: 'check-composition',
      promptId: String(formData.get('promptId') ?? ''),
      feedback,
    });
  }

  // Interest-driven practice: the student names what the practice should be
  // about and gets a fresh prompt set grounded in it. AI generation is
  // preferred; the deterministic topic templates keep choice working with no
  // ANTHROPIC_API_KEY, so personalizing never dead-ends.
  if (intent === 'personalize-composition') {
    if (!isCompositionPracticeEnabled()) {
      throw new Response('Composition practice is not enabled', {
        status: 400,
      });
    }
    const lesson = getQuickWritingLessonBySlug(params.lessonSlug);
    if (lesson?.section !== 'Composition') {
      throw new Response('Only composition practice can be personalized', {
        status: 400,
      });
    }

    const topic = sanitizeCompositionTopic(String(formData.get('topic') ?? ''));
    if (!topic) {
      return dataResponse<CompositionPersonalizeActionData>({
        intent: 'personalize-composition',
        ok: false,
        message:
          'Let’s keep practice topics classroom-friendly — try a different one.',
      });
    }

    const staticPrompts = getQuickWritingPracticePrompts(lesson.slug);
    const generated = await generatePracticePrompts({
      skill: context.skill,
      lessonTitle: context.title,
      rule: context.rule,
      exampleExercises: staticPrompts
        .slice(0, 4)
        .map((prompt) => prompt.exercise),
      count: 5,
      topic,
    });
    const prompts: QuickWritingPracticePrompt[] =
      generated.length > 0
        ? generated.map((prompt, index) => ({
            id: `${lesson.slug}-personal-${index + 1}`,
            ...prompt,
          }))
        : buildTopicFallbackPrompts(lesson.slug, topic);

    return dataResponse<CompositionPersonalizeActionData>({
      intent: 'personalize-composition',
      ok: true,
      topic,
      source: generated.length > 0 ? 'ai' : 'template',
      prompts,
    });
  }

  // Self-serve grammar students can keep drilling a skill indefinitely: once
  // they work through the offline ACT bank we generate fresh items grounded in
  // the same rule and examples, so the panel never runs dry. Grading itself is
  // done on the client (a deterministic index comparison), so there is no check
  // intent for grammar.
  if (intent !== 'generate-act') {
    throw new Response('Unsupported action', { status: 400 });
  }

  const requested = Number(formData.get('count') ?? 5);
  const count = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 8)
    : 5;
  const exampleSentences = getActPracticeQuestions(context.slug)
    .slice(0, 3)
    .map((question) => question.sentence);
  const questions = await generateActPracticeQuestions({
    lessonSlug: context.slug,
    skill: context.skill,
    lessonTitle: context.title,
    rule: context.rule,
    exampleSentences,
    count,
  });

  return dataResponse<ActGenerateActionData>({
    intent: 'generate-act',
    questions,
  });
}

export default function WritingLessonDetailRoute() {
  const {
    lesson,
    isComposition,
    lessonBody,
    practicePrompts,
    actQuestions,
    isTeacher,
    teacherClasses,
    loungeModule,
  } = useLoaderData<typeof loader>();

  // Grammar lessons drill ACT multiple choice; composition lessons are
  // constructed response graded by the tutor feedback service.
  const practicePanel = isComposition ? (
    <CompositionPracticePanel prompts={practicePrompts} />
  ) : (
    <StudentPracticePanel actQuestions={actQuestions} />
  );

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
              {loungeModule ? (
                <LoungeModuleCard loungeModule={loungeModule} />
              ) : null}
              <TeacherAssignPanel
                lessonSlug={lesson.slug}
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

function StudentPracticePanel({
  actQuestions,
}: {
  actQuestions: ActPracticeQuestion[];
}) {
  const generateFetcher = useFetcher<ActGenerateActionData>();
  const [extraQuestions, setExtraQuestions] = useState<ActPracticeQuestion[]>(
    []
  );
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [grade, setGrade] = useState<ActGradeResult | null>(null);

  // Offline bank first (instant), then fresh AI items appended as the student
  // works through them, so the well never runs dry.
  const allQuestions = [...actQuestions, ...extraQuestions];
  const activeQuestion = allQuestions[questionIndex] ?? null;
  const isGenerating = generateFetcher.state !== 'idle';
  const isGraded = grade !== null;

  // Append freshly generated questions, skipping any ids we already hold.
  useEffect(() => {
    const generated = generateFetcher.data;
    if (
      generated?.intent !== 'generate-act' ||
      generated.questions.length === 0
    ) {
      return;
    }
    setExtraQuestions((current) => {
      const seen = new Set([
        ...actQuestions.map((item) => item.id),
        ...current.map((item) => item.id),
      ]);
      const fresh = generated.questions.filter((item) => !seen.has(item.id));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
  }, [generateFetcher.data, actQuestions]);

  function requestMoreQuestions() {
    if (isGenerating) return;
    generateFetcher.submit(
      { intent: 'generate-act', count: '5' },
      { method: 'post' }
    );
  }

  function checkAnswer() {
    if (activeQuestion === null || selectedIndex === null || grade !== null) {
      return;
    }
    setGrade(gradeActAnswer(activeQuestion, selectedIndex));
  }

  function showNextQuestion() {
    if (allQuestions.length === 0) return;
    const nextIndex = questionIndex + 1;
    // Pull a fresh batch before the student reaches the end of what's loaded.
    if (nextIndex >= allQuestions.length - 2) {
      requestMoreQuestions();
    }
    // Advance if a next question is loaded; otherwise wrap so it never
    // dead-ends while the next batch is still generating.
    setQuestionIndex(nextIndex < allQuestions.length ? nextIndex : 0);
    setSelectedIndex(null);
    setGrade(null);
  }

  const parts = activeQuestion
    ? splitAroundUnderline(activeQuestion.sentence, activeQuestion.underline)
    : null;

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
          {activeQuestion ? (
            <span className="text-xs font-medium text-muted-foreground">
              Question {questionIndex + 1}
            </span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-5">
        {activeQuestion && parts ? (
          <div
            className="space-y-4"
            onKeyDown={(event) => {
              // Enter checks the answer once a choice is picked — the
              // keyboard-first flow students expect on the ACT.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                checkAnswer();
              }
            }}
          >
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Choose the best answer
              </p>
              <p className="mt-2 text-base leading-relaxed text-foreground">
                {parts.before}
                {parts.underlined ? (
                  <span className="font-semibold underline decoration-primary decoration-2 underline-offset-4">
                    {parts.underlined}
                  </span>
                ) : null}
                {parts.after}
              </p>
            </div>

            <fieldset className="space-y-2" disabled={isGraded}>
              <legend className="sr-only">Answer choices</legend>
              {activeQuestion.choices.map((choice, index) => {
                const label = index === 0 ? NO_CHANGE_LABEL : choice;
                const isSelected = selectedIndex === index;
                const isCorrect = index === activeQuestion.correctChoiceIndex;
                // After grading, tint the correct row green and a wrong pick red.
                const tone = isGraded
                  ? isCorrect
                    ? 'border-emerald-400 bg-emerald-50'
                    : isSelected
                      ? 'border-rose-300 bg-rose-50'
                      : 'border-border/70'
                  : isSelected
                    ? 'border-primary bg-primary/5'
                    : 'border-border/70 hover:border-primary/50';
                return (
                  <label
                    key={index}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-base transition-colors sm:text-sm ${tone}`}
                  >
                    <input
                      type="radio"
                      name="act-choice"
                      className="mt-0.5 h-4 w-4"
                      checked={isSelected}
                      onChange={() => setSelectedIndex(index)}
                    />
                    <span className="flex-1">
                      <span className="mr-1.5 font-semibold text-muted-foreground">
                        {String.fromCharCode(65 + index)}.
                      </span>
                      {label}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div className="flex flex-wrap items-center gap-2">
              {!isGraded ? (
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={selectedIndex === null}
                  onClick={checkAnswer}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Check my answer
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-muted-foreground"
                onClick={showNextQuestion}
              >
                {isGenerating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-2 h-4 w-4" />
                )}
                New question
              </Button>
            </div>

            {grade ? (
              <ActResultPanel question={activeQuestion} grade={grade} />
            ) : null}
          </div>
        ) : (
          <p className="text-base text-muted-foreground sm:text-sm">
            This lesson does not have practice questions yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CompositionPracticePanel({
  prompts: defaultPrompts,
}: {
  prompts: QuickWritingPracticePrompt[];
}) {
  const feedbackFetcher = useFetcher<CompositionCheckActionData>();
  const personalizeFetcher = useFetcher<CompositionPersonalizeActionData>();
  const [promptIndex, setPromptIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [feedback, setFeedback] = useState<PracticeFeedbackResult | null>(null);
  // Interest-driven practice: once the student names a topic, their prompt set
  // is rebuilt around it and replaces the archived defaults until cleared.
  const [personalPrompts, setPersonalPrompts] = useState<
    QuickWritingPracticePrompt[] | null
  >(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [topicInput, setTopicInput] = useState('');
  const [topicMessage, setTopicMessage] = useState<string | null>(null);

  const prompts = personalPrompts ?? defaultPrompts;
  const activePrompt = prompts[promptIndex] ?? null;
  const isChecking = feedbackFetcher.state !== 'idle';
  const isPersonalizing = personalizeFetcher.state !== 'idle';

  // Adopt feedback once it comes back for the prompt currently on screen — a
  // late response for a prompt the student already moved past is ignored.
  useEffect(() => {
    const data = feedbackFetcher.data;
    if (
      data?.intent === 'check-composition' &&
      data.promptId === activePrompt?.id
    ) {
      setFeedback(data.feedback);
    }
  }, [feedbackFetcher.data, activePrompt?.id]);

  // Adopt a personalized prompt set (or the reason the topic was declined).
  useEffect(() => {
    const data = personalizeFetcher.data;
    if (data?.intent !== 'personalize-composition') return;
    if (data.ok && data.prompts && data.prompts.length > 0 && data.topic) {
      setPersonalPrompts(data.prompts);
      setActiveTopic(data.topic);
      setTopicMessage(null);
      setTopicInput('');
      setPromptIndex(0);
      setResponse('');
      setFeedback(null);
    } else if (!data.ok) {
      setTopicMessage(data.message ?? 'Try a different topic.');
    }
  }, [personalizeFetcher.data]);

  function personalize(topic: string) {
    if (isPersonalizing) return;
    const trimmed = topic.trim();
    if (!trimmed) return;
    personalizeFetcher.submit(
      { intent: 'personalize-composition', topic: trimmed },
      { method: 'post' }
    );
  }

  function clearTopic() {
    setPersonalPrompts(null);
    setActiveTopic(null);
    setTopicMessage(null);
    setPromptIndex(0);
    setResponse('');
    setFeedback(null);
  }

  function checkResponse() {
    if (activePrompt === null || isChecking) return;
    feedbackFetcher.submit(
      {
        intent: 'check-composition',
        promptId: activePrompt.id,
        exercise: activePrompt.exercise,
        instruction: activePrompt.instruction,
        response,
      },
      { method: 'post' }
    );
  }

  function showNextPrompt() {
    if (prompts.length === 0) return;
    setPromptIndex((current) => (current + 1) % prompts.length);
    setResponse('');
    setFeedback(null);
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
        {activeTopic ? (
          <div
            data-testid="composition-topic-active"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
          >
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm text-foreground">
              Practicing with <span className="font-medium">{activeTopic}</span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ml-auto h-7 rounded-full px-2 text-xs text-muted-foreground"
              onClick={clearTopic}
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
              Pick something you care about and the prompts will be built around
              it.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COMPOSITION_TOPIC_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={isPersonalizing}
                  onClick={() => personalize(suggestion)}
                  className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition hover:bg-muted disabled:opacity-50"
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
                    personalize(topicInput);
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
                disabled={isPersonalizing || topicInput.trim().length === 0}
                onClick={() => personalize(topicInput)}
              >
                {isPersonalizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Make it mine'
                )}
              </Button>
            </div>
            {topicMessage ? (
              <p
                data-testid="composition-topic-message"
                className="text-sm text-destructive"
              >
                {topicMessage}
              </p>
            ) : null}
          </div>
        )}

        {activePrompt ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 bg-muted/30 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Your prompt
              </p>
              <p className="mt-2 text-base leading-relaxed text-foreground">
                {activePrompt.exercise}
              </p>
              <p className="mt-3 flex gap-2 text-sm font-medium text-foreground">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{activePrompt.instruction}</span>
              </p>
            </div>

            <Textarea
              data-testid="composition-response"
              aria-label="Your response"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              placeholder="Write your response here…"
              className="min-h-28 text-base sm:text-sm"
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="rounded-full"
                disabled={isChecking}
                onClick={checkResponse}
              >
                {isChecking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquareText className="mr-2 h-4 w-4" />
                )}
                Check my answer
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="rounded-full text-muted-foreground"
                onClick={showNextPrompt}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                New prompt
              </Button>
            </div>

            {feedback ? <PracticeFeedbackPanel feedback={feedback} /> : null}
          </div>
        ) : (
          <p className="text-base text-muted-foreground sm:text-sm">
            This lesson does not have practice prompts yet.
          </p>
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
  const tone =
    feedback.status === 'strong'
      ? 'border-emerald-300 bg-emerald-50'
      : feedback.status === 'developing'
        ? 'border-amber-300 bg-amber-50'
        : 'border-rose-300 bg-rose-50';

  return (
    <div
      data-testid="composition-result"
      className={`space-y-3 rounded-xl border p-4 ${tone}`}
    >
      <div className="flex items-center gap-2">
        <MessageSquareText className="h-4 w-4 text-foreground" />
        <span className="text-sm font-semibold text-foreground">
          {practiceFeedbackStatusLabel(feedback.status)}
        </span>
        {feedback.degraded ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Quick self-check
          </span>
        ) : null}
      </div>

      <p className="text-sm leading-relaxed text-foreground">
        {feedback.summary}
      </p>

      {feedback.strengths.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What's working
          </p>
          <ul className="ml-1 space-y-1 border-l-2 border-border pl-3 text-sm text-foreground">
            {feedback.strengths.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {feedback.focus.length > 0 ? (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Try next
          </p>
          <ul className="ml-1 space-y-1 border-l-2 border-border pl-3 text-sm text-foreground">
            {feedback.focus.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-sm font-medium italic text-muted-foreground">
        {feedback.encouragement}
      </p>
    </div>
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

function ActResultPanel({
  question,
  grade,
}: {
  question: ActPracticeQuestion;
  grade: ActGradeResult;
}) {
  const correctLabel =
    grade.correctChoiceIndex === 0
      ? NO_CHANGE_LABEL
      : question.choices[grade.correctChoiceIndex];
  const correctLetter = String.fromCharCode(65 + grade.correctChoiceIndex);

  return (
    <div
      data-testid="act-result"
      className={`space-y-2 rounded-xl border p-4 ${
        grade.correct
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-rose-300 bg-rose-50'
      }`}
    >
      <div className="flex items-center gap-2">
        {grade.correct ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-600" />
        )}
        <span className="text-sm font-semibold text-foreground">
          {grade.correct ? 'Correct!' : 'Not quite'}
        </span>
      </div>

      {!grade.correct ? (
        <p className="text-sm text-foreground">
          The best answer is{' '}
          <span className="font-semibold">
            {correctLetter}. {correctLabel}
          </span>
          .
        </p>
      ) : null}

      <p className="text-sm leading-relaxed text-muted-foreground">
        {grade.explanation}
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
