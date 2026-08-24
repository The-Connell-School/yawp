import {
  data as dataResponse,
  redirect,
  useLoaderData,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from 'react-router';

import { GeneralErrorBoundary } from '~/components/error-boundary';
import {
  PracticeRunner,
  type PracticeRunnerItem,
  type PracticeRunnerResult,
} from '~/components/writing-lessons/practice-runner';
import { requireMembership, requireUserId } from '~/utils/auth.server';
import { gradeActAnswer } from '~/utils/writing-lessons/act-practice.shared';
import { writingPracticeAssignmentTitle } from '~/utils/writing-lessons/assignment-title';
import { isCompositionPracticeEnabled } from '~/utils/writing-lessons/composition-flag.server';
import {
  getAssignedPracticeForStudentById,
  getOrCreateStudentPracticeSet,
  recordCompositionPracticeAttempt,
  recordWritingPracticeAttempt,
} from '~/utils/writing-lessons/practice-assignments.server';
import { generatePracticeFeedback } from '~/utils/writing-lessons/practice-feedback.server';
import { detectPracticeGuardrail } from '~/utils/writing-lessons/practice-feedback.shared';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingLessonRecap,
} from '~/utils/writing-lessons/static-lessons.server';

function assignmentIncludesComposition(lessonSlugs: string[]) {
  return lessonSlugs.some(
    (slug) => getQuickWritingLessonBySlug(slug)?.section === 'Composition'
  );
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (!profile.organization.writingPracticeEnabled) {
    throw redirect('/app');
  }

  const classAssignment = await getAssignedPracticeForStudentById(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!classAssignment) {
    throw new Response('Assigned practice not found', { status: 404 });
  }

  const { assignment } = classAssignment;
  if (
    assignmentIncludesComposition(assignment.lessonSlugs) &&
    !isCompositionPracticeEnabled()
  ) {
    throw new Response('Assigned practice not found', { status: 404 });
  }
  const sequence = await getOrCreateStudentPracticeSet({
    classAssignmentId: classAssignment.id,
    membershipId: profile.id,
    lessonSlugs: assignment.lessonSlugs,
    problemCount: assignment.problemCount,
  });

  // Collapse the student's attempts (which now include composition revisions)
  // into per-problem state so each item knows whether it is already mastered.
  const attemptedPromptIds = new Set(
    classAssignment.attempts.map((attempt) => attempt.promptId)
  );
  const masteredPromptIds = new Set(
    classAssignment.attempts
      .filter((attempt) => attempt.status === 'strong')
      .map((attempt) => attempt.promptId)
  );
  const items = sequence.map((item) => {
    const promptId =
      item.kind === 'composition' ? item.prompt.id : item.question.id;
    // ACT problems are done once answered; composition problems are done only
    // once mastered (a `strong` tutor verdict) — a wrong-then-abandoned answer
    // stays "attempted".
    const done =
      item.kind === 'composition'
        ? masteredPromptIds.has(promptId)
        : attemptedPromptIds.has(promptId);
    const initialStatus: 'done' | 'attempted' | 'todo' = done
      ? 'done'
      : attemptedPromptIds.has(promptId)
        ? 'attempted'
        : 'todo';
    return { ...item, initialStatus };
  });

  const hasComposition = sequence.some((item) => item.kind === 'composition');

  // The abridged lesson behind each skill in the set, so a student can refresh
  // it beside the problem instead of navigating away from their place.
  const lessonRecaps = [...new Set(sequence.map((item) => item.lessonSlug))]
    .map((slug) => getQuickWritingLessonRecap(slug))
    .filter((recap): recap is NonNullable<typeof recap> => recap !== null);

  return dataResponse({
    classAssignmentId: classAssignment.id,
    title: writingPracticeAssignmentTitle(assignment),
    instructions: assignment.instructions,
    dueAt: assignment.dueAt ? assignment.dueAt.toISOString() : null,
    problemCount: assignment.problemCount,
    items,
    hasComposition,
    lessonRecaps,
  });
}

/** Both flows return the same shape, so the shared runner can read either. */
type AssignedActionData = PracticeRunnerResult;

export async function action({ request, params }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  if (!profile.organization.writingPracticeEnabled) {
    throw new Response('Writing practice not found', { status: 404 });
  }

  const classAssignment = await getAssignedPracticeForStudentById(
    params.classAssignmentId ?? '',
    profile.id
  );
  if (!classAssignment) {
    throw new Response('Assigned practice not found', { status: 404 });
  }
  if (
    assignmentIncludesComposition(classAssignment.assignment.lessonSlugs) &&
    !isCompositionPracticeEnabled()
  ) {
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

export default function AssignedPracticeRoute() {
  const {
    classAssignmentId,
    title,
    instructions,
    dueAt,
    problemCount,
    items,
    hasComposition,
    lessonRecaps,
  } = useLoaderData<typeof loader>();

  // The same screen a student gets when they start practice on their own —
  // here it records every attempt against the assignment.
  return (
    <PracticeRunner
      eyebrow="Assigned practice"
      title={title}
      instructions={instructions}
      dueAt={dueAt}
      problemCount={problemCount}
      items={items as PracticeRunnerItem[]}
      hasComposition={hasComposition}
      backTo="/app/writing-lessons"
      backLabel="Back to practice"
      reviewFrom={`/app/writing-lessons/assigned/${classAssignmentId}`}
      lessonRecaps={lessonRecaps}
    />
  );
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />;
}
