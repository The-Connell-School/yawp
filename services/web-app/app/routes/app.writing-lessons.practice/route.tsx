import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  PenLine,
  RotateCcw,
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
import { ActPracticeQuestionView } from '~/components/writing-lessons/act-practice-question';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { getActPracticeQuestions } from '~/utils/writing-lessons/act-practice-bank';
import { generateActPracticeQuestions } from '~/utils/writing-lessons/act-practice-generation.server';
import {
  gradeActAnswer,
  type ActGradeResult,
  type ActPracticeQuestion,
} from '~/utils/writing-lessons/act-practice.shared';
import { buildActPracticeSequence } from '~/utils/writing-lessons/practice-assignments.server';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
} from '~/utils/writing-lessons/static-lessons.server';

const MAX_PROBLEMS = 20;

function parseSkills(raw: string | null): string[] {
  return (
    (raw ?? '')
      .split(',')
      .map((slug) => slug.trim())
      .filter(Boolean)
      // The self-directed session is ACT multiple-choice only, so composition
      // lessons (constructed response) can never be pulled into one.
      .filter(
        (slug) =>
          getQuickWritingLessonBySlug(slug)?.section === 'Grammar & Mechanics'
      )
  );
}

function clampCount(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return 5;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_PROBLEMS);
}

// A self-directed practice session: the student picks the skills and how many
// problems, and we build an interleaved ACT set from the selected skills.
// Nothing is persisted — this is on-the-fly practice, endless via AI top-ups.
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const url = new URL(request.url);
  const skills = parseSkills(url.searchParams.get('skills'));
  const count = clampCount(url.searchParams.get('count'));

  if (skills.length === 0) {
    return redirect('/app/writing-lessons');
  }

  const sequence = buildActPracticeSequence(skills, count);
  const skillTitles = skills.map(
    (slug) => getQuickWritingLessonBySlug(slug)?.title ?? slug
  );

  return dataResponse({ sequence, skills, skillTitles, count });
}

type GenerateActionData = {
  intent: 'generate-act';
  lessonSlug: string;
  lessonTitle: string;
  questions: ActPracticeQuestion[];
};

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  await requireMembership(request, userId);

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  const lessonSlug = String(formData.get('lessonSlug') ?? '');
  const context = getQuickWritingLessonContext(lessonSlug);
  if (!context) {
    throw new Response('Unknown practice skill', { status: 400 });
  }

  // Grading is deterministic and done on the client, so the only server action
  // is topping up the session with fresh AI questions for a skill.
  if (intent !== 'generate-act') {
    throw new Response('Unsupported action', { status: 400 });
  }

  const requested = Number(formData.get('count') ?? 4);
  const count = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), 6)
    : 4;
  const exampleSentences = getActPracticeQuestions(lessonSlug)
    .slice(0, 3)
    .map((question) => question.sentence);
  const questions = await generateActPracticeQuestions({
    lessonSlug,
    skill: context.skill,
    lessonTitle: context.title,
    rule: context.rule,
    exampleSentences,
    count,
  });

  return dataResponse<GenerateActionData>({
    intent: 'generate-act',
    lessonSlug,
    lessonTitle: context.title,
    questions,
  });
}

type SessionItem = {
  lessonSlug: string;
  lessonTitle: string;
  question: ActPracticeQuestion;
};

export default function WritingPracticeSessionRoute() {
  const { sequence, skills, skillTitles } = useLoaderData<typeof loader>();

  const initialItems: SessionItem[] = sequence.map((item) => ({
    lessonSlug: item.lessonSlug,
    lessonTitle: item.lessonTitle,
    question: item.question,
  }));

  const generateFetcher = useFetcher<GenerateActionData>();

  const [items, setItems] = useState<SessionItem[]>(initialItems);
  const [index, setIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [grade, setGrade] = useState<ActGradeResult | null>(null);
  // Round-robin over the selected skills when topping up the session.
  const [nextSkill, setNextSkill] = useState(0);

  const active = items[index] ?? null;
  const isGenerating = generateFetcher.state !== 'idle';
  const isGraded = grade !== null;

  useEffect(() => {
    const generated = generateFetcher.data;
    if (
      generated?.intent !== 'generate-act' ||
      generated.questions.length === 0
    ) {
      return;
    }
    setItems((current) => {
      const seen = new Set(current.map((item) => item.question.id));
      const fresh = generated.questions
        .filter((question) => !seen.has(question.id))
        .map((question) => ({
          lessonSlug: generated.lessonSlug,
          lessonTitle: generated.lessonTitle,
          question,
        }));
      return fresh.length > 0 ? [...current, ...fresh] : current;
    });
  }, [generateFetcher.data]);

  function requestMore() {
    if (isGenerating || skills.length === 0) return;
    const slug = skills[nextSkill % skills.length];
    setNextSkill((current) => current + 1);
    generateFetcher.submit(
      { intent: 'generate-act', lessonSlug: slug, count: '4' },
      { method: 'post' }
    );
  }

  function checkAnswer() {
    if (active === null || selectedIndex === null || grade !== null) return;
    setGrade(gradeActAnswer(active.question, selectedIndex));
  }

  function showNext() {
    if (items.length === 0) return;
    const next = index + 1;
    if (next >= items.length - 2) {
      requestMore();
    }
    setIndex(next < items.length ? next : 0);
    setSelectedIndex(null);
    setGrade(null);
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
              <div
                className="space-y-4"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    checkAnswer();
                  }
                }}
              >
                <Badge variant="secondary" size="sm" className="w-fit">
                  {active.lessonTitle}
                </Badge>

                <ActPracticeQuestionView
                  question={active.question}
                  selectedIndex={selectedIndex}
                  grade={grade}
                  onSelect={setSelectedIndex}
                />

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
              </div>
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
