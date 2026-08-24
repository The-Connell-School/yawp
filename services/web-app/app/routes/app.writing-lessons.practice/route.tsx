import {
  Link,
  data as dataResponse,
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  PracticeRunner,
  type PracticeRunnerItem,
  type PracticeRunnerResult,
  type RewriteCheckResult,
} from '~/components/writing-lessons/practice-runner';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';
import {
  buildTopicFallbackPrompts,
  sanitizeCompositionTopic,
} from '~/utils/writing-lessons/composition-topic-prompts';
import {
  buildMixedGeneratedPracticeSequence,
  type MixedAssignedPracticeItem,
} from '~/utils/writing-lessons/practice-assignments.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import { detectPracticeGuardrail } from '~/utils/writing-lessons/practice-feedback.shared';
import { generatePracticePrompts } from '~/utils/writing-lessons/practice-prompt-generation.server';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingLessonRecap,
  getQuickWritingPracticePrompts,
  type QuickWritingPracticePrompt,
} from '~/utils/writing-lessons/static-lessons.server';

const MAX_PROBLEMS = 20;
const DEFAULT_PROBLEMS = 5;

/**
 * The skills a session can be built from: real lessons only, and composition
 * lessons only while the Composition rollout flag is on — a self-directed set
 * must never reach past the same boundary an assigned one respects.
 */
function parseSkills(raw: string | null): string[] {
  const compositionEnabled = isCompositionPracticeEnabled();
  const seen = new Set<string>();
  return (raw ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean)
    .filter((slug) => {
      if (seen.has(slug)) return false;
      seen.add(slug);
      const lesson = getQuickWritingLessonBySlug(slug);
      if (!lesson) return false;
      return lesson.section !== 'Composition' || compositionEnabled;
    });
}

function clampCount(raw: string | null): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return DEFAULT_PROBLEMS;
  return Math.min(Math.max(Math.trunc(value), 1), MAX_PROBLEMS);
}

function isComposition(slug: string): boolean {
  return getQuickWritingLessonBySlug(slug)?.section === 'Composition';
}

function sessionTitle(skills: string[]): string {
  if (skills.length === 1) {
    return getQuickWritingLessonBySlug(skills[0])?.title ?? 'Writing practice';
  }
  if (skills.every(isComposition)) return 'Composition practice';
  if (skills.every((slug) => !isComposition(slug))) return 'Grammar practice';
  return 'Writing practice';
}

/**
 * Interest-driven practice: the student names what the set should be about and
 * the prompts are rebuilt around it. AI generation is preferred; the
 * deterministic topic templates keep choice working with no ANTHROPIC_API_KEY,
 * so personalizing never dead-ends.
 */
async function buildTopicSequence(
  skills: string[],
  problemCount: number,
  topic: string
): Promise<MixedAssignedPracticeItem[]> {
  const perLesson = await Promise.all(
    skills.map(async (slug) => {
      const context = getQuickWritingLessonContext(slug);
      const lesson = getQuickWritingLessonBySlug(slug);
      if (!context || !lesson) return null;
      const staticPrompts = getQuickWritingPracticePrompts(slug);
      const generated = await generatePracticePrompts({
        skill: context.skill,
        lessonTitle: context.title,
        rule: context.rule,
        exampleExercises: staticPrompts
          .slice(0, 4)
          .map((prompt) => prompt.exercise),
        count: problemCount,
        topic,
      });
      const prompts: QuickWritingPracticePrompt[] =
        generated.length > 0
          ? generated.map((prompt, index) => ({
              id: `${slug}-personal-${index + 1}`,
              ...prompt,
            }))
          : buildTopicFallbackPrompts(slug, topic);
      return { slug, title: lesson.title, prompts };
    })
  );

  // Interleave round-robin so a multi-skill set alternates skills.
  const interleaved: Array<{
    lessonSlug: string;
    lessonTitle: string;
    prompt: QuickWritingPracticePrompt;
  }> = [];
  let round = 0;
  let addedThisRound = true;
  while (addedThisRound) {
    addedThisRound = false;
    for (const lesson of perLesson) {
      const prompt = lesson?.prompts[round];
      if (lesson && prompt) {
        interleaved.push({
          lessonSlug: lesson.slug,
          lessonTitle: lesson.title,
          prompt,
        });
        addedThisRound = true;
      }
    }
    round += 1;
  }

  if (interleaved.length === 0) return [];
  return Array.from({ length: problemCount }, (_, index) => ({
    kind: 'composition' as const,
    position: index + 1,
    ...interleaved[index % interleaved.length],
  }));
}

/**
 * A self-directed practice session: the student picks the skills and how many
 * problems, and gets the same practice screen a teacher's assignment would put
 * in front of them. Nothing is persisted — this is practice they gave
 * themselves, so it never reaches a teacher's results.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (!profile.organization.writingPracticeEnabled) {
    throw redirect('/app');
  }

  const url = new URL(request.url);
  const skills = parseSkills(url.searchParams.get('skills'));
  const count = clampCount(url.searchParams.get('count'));

  if (skills.length === 0) {
    return redirect('/app/writing-lessons');
  }

  // A topic only shapes constructed response, so it applies to a set built
  // purely from composition skills; anything else keeps the standard prompts.
  const requestedTopic = url.searchParams.get('topic');
  const topic = requestedTopic
    ? sanitizeCompositionTopic(requestedTopic)
    : null;
  const topicApplies = Boolean(topic) && skills.every(isComposition);

  const sequence =
    topic && topicApplies
      ? await buildTopicSequence(skills, count, topic)
      : (await buildMixedGeneratedPracticeSequence(skills, count)).items;

  const items = sequence.map((item) => ({
    ...item,
    initialStatus: 'todo' as const,
  }));
  const skillTitles = skills.map(
    (slug) => getQuickWritingLessonBySlug(slug)?.title ?? slug
  );
  // The abridged lesson behind each skill, so the refresher opens beside the
  // problem rather than sending the student back to the lesson page.
  const lessonRecaps = skills
    .map((slug) => getQuickWritingLessonRecap(slug))
    .filter((recap): recap is NonNullable<typeof recap> => recap !== null);
  const sessionPath = `/app/writing-lessons/practice?${new URLSearchParams({
    skills: skills.join(','),
    count: String(count),
    ...(topic && topicApplies ? { topic } : {}),
  }).toString()}`;

  return dataResponse({
    title: sessionTitle(skills),
    skills,
    skillTitles,
    items,
    problemCount: items.length,
    hasComposition: items.some((item) => item.kind === 'composition'),
    topic: topicApplies ? topic : null,
    // The topic was asked for but could not shape this set (it was declined by
    // the safety screen, or the set includes grammar skills).
    topicDeclined: Boolean(requestedTopic) && !topicApplies,
    sessionPath,
    lessonRecaps,
  });
}

type PracticeSessionActionData = PracticeRunnerResult | RewriteCheckResult;

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (!profile.organization.writingPracticeEnabled) {
    throw new Response('Writing practice not found', { status: 404 });
  }

  const formData = await request.formData();
  const intent = String(formData.get('intent') ?? '');
  const lessonSlug = String(formData.get('lessonSlug') ?? '');
  const context = getQuickWritingLessonContext(lessonSlug);
  const lesson = getQuickWritingLessonBySlug(lessonSlug);
  if (!context || !lesson) {
    throw new Response('Unknown practice skill', { status: 400 });
  }
  if (lesson.section === 'Composition' && !isCompositionPracticeEnabled()) {
    throw new Response('Unknown practice skill', { status: 400 });
  }

  // A written correction of an ACT sentence on a grammar lesson. Graded by the
  // same tutor service as composition, grounded in this lesson's skill + rule.
  if (intent === 'check-rewrite') {
    if (lesson.section !== 'Grammar & Mechanics') {
      throw new Response('Only grammar practice takes a rewrite', {
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
    return dataResponse<PracticeSessionActionData>({
      intent: 'check-rewrite',
      questionId: String(formData.get('questionId') ?? ''),
      feedback,
    });
  }

  // Constructed response: the tutor grades the writing so the student can
  // revise toward mastery, exactly as an assigned composition problem does.
  // Nothing is persisted — a self-directed set is not assignment progress —
  // so the set the answer belongs to travels with the request.
  if (String(formData.get('kind') ?? '') === 'composition') {
    if (lesson.section !== 'Composition') {
      throw new Response('Unknown or invalid practice answer', { status: 400 });
    }
    const position = Number(formData.get('position'));
    const safePosition = Number.isFinite(position) ? position : 0;
    const exercise = String(formData.get('exercise') ?? '');
    const instruction = String(formData.get('instruction') ?? '');
    const responseText = String(formData.get('response') ?? '');

    const guardrail = detectPracticeGuardrail({
      exercise,
      response: responseText,
    });
    if (guardrail) {
      return dataResponse<PracticeSessionActionData>({
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
      exercise,
      instruction,
      response: responseText,
    });

    return dataResponse<PracticeSessionActionData>({
      kind: 'composition',
      position: safePosition,
      feedback,
      // Not persisted, but it counts on this screen: the revise-and-master
      // loop is what makes the practice worth doing.
      recorded: true,
    });
  }

  // Multiple choice grades on the client (a deterministic index comparison),
  // so there is no server intent for it.
  throw new Response('Unsupported action', { status: 400 });
}

export default function WritingPracticeSessionRoute() {
  const {
    title,
    skillTitles,
    items,
    problemCount,
    hasComposition,
    topic,
    topicDeclined,
    sessionPath,
    lessonRecaps,
  } = useLoaderData<typeof loader>();

  return (
    <PracticeRunner
      eyebrow="Your practice"
      title={title}
      instructions={
        topicDeclined
          ? 'We kept the standard prompts for this set. Practice is graded on your screen only — nothing here is sent to your teacher.'
          : 'Practice you gave yourself: same screen as an assigned set, but nothing here is sent to your teacher.'
      }
      headerBadges={
        <>
          {topic ? (
            <Badge
              variant="outline"
              size="sm"
              data-testid="composition-topic-active"
            >
              Practicing with {topic}
            </Badge>
          ) : null}
          {skillTitles.length > 1
            ? skillTitles.map((skillTitle) => (
                <Badge key={skillTitle} variant="outline" size="sm">
                  {skillTitle}
                </Badge>
              ))
            : null}
        </>
      }
      problemCount={problemCount}
      items={items as PracticeRunnerItem[]}
      hasComposition={hasComposition}
      backTo="/app/writing-lessons"
      backLabel="Back to practice"
      reviewFrom={sessionPath}
      lessonRecaps={lessonRecaps}
      // Deterministic index grading, and nothing to record: check it here.
      gradeActOnClient
      // Spotting the right choice and writing the fix are different skills;
      // self-directed practice is where a student can drill both.
      allowRewrite
      submitLabel="Check my answer"
      submittingLabel="Checking…"
      emptyMessage="This practice set is empty. Pick a skill to start."
      completionHeadline="You’ve finished this practice set."
      completionExtra={
        <Button asChild size="sm" data-testid="practice-again">
          <Link to={sessionPath} reloadDocument>
            Practice again
          </Link>
        </Button>
      }
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
