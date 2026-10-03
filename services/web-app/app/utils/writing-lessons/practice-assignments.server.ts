import { prisma } from '~/utils/db.server';

import { getActPracticeQuestions } from './act-practice-bank';
import { generateActPracticeQuestions } from './act-practice-generation.server';
import type {
  ActAttemptRecord,
  ActGradeResult,
  ActPracticeQuestion,
} from './act-practice.shared';
import type {
  CompositionAttemptRecord,
  PracticeFeedbackResult,
} from './practice-feedback.shared';
import { generatePracticePrompts } from './practice-prompt-generation.server';
import {
  getQuickWritingLessonBySlug,
  getQuickWritingLessonContext,
  getQuickWritingPracticePrompts,
  type QuickWritingPracticePrompt,
} from './static-lessons.server';

export type AssignedPracticeItem = {
  /** 1-based position within the assignment. */
  position: number;
  lessonSlug: string;
  lessonTitle: string;
  prompt: QuickWritingPracticePrompt;
};

/**
 * Expands an assignment (lesson slugs + how many problems) into an ordered
 * practice sequence. Prompts from multiple lessons are interleaved round-robin
 * so mixed-skill assignments alternate skills; the sequence cycles if the
 * requested problem count exceeds the number of distinct prompts available.
 */
export function buildAssignedPracticeSequence(
  lessonSlugs: string[],
  problemCount: number
): AssignedPracticeItem[] {
  const perLesson = lessonSlugs
    .map((slug) => {
      const lesson = getQuickWritingLessonBySlug(slug);
      if (!lesson) return null;
      return {
        slug,
        title: lesson.title,
        prompts: getQuickWritingPracticePrompts(slug),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

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
      const prompt = lesson.prompts[round];
      if (prompt) {
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

  if (interleaved.length === 0 || problemCount <= 0) return [];

  const sequence: AssignedPracticeItem[] = [];
  for (let i = 0; i < problemCount; i += 1) {
    const source = interleaved[i % interleaved.length];
    sequence.push({ position: i + 1, ...source });
  }
  return sequence;
}

export type ActAssignedPracticeItem = {
  /** 1-based position within the assignment. */
  position: number;
  lessonSlug: string;
  lessonTitle: string;
  question: ActPracticeQuestion;
};

/**
 * ACT version of {@link buildAssignedPracticeSequence}: expands the selected
 * skills into an interleaved ACT multiple-choice sequence from the offline
 * bank, cycling if the requested count exceeds the questions available.
 */
export function buildActPracticeSequence(
  lessonSlugs: string[],
  problemCount: number
): ActAssignedPracticeItem[] {
  const perLesson = lessonSlugs
    .map((slug) => {
      const lesson = getQuickWritingLessonBySlug(slug);
      if (!lesson) return null;
      return {
        slug,
        title: lesson.title,
        questions: getActPracticeQuestions(slug),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const interleaved: Array<Omit<ActAssignedPracticeItem, 'position'>> = [];
  let round = 0;
  let addedThisRound = true;
  while (addedThisRound) {
    addedThisRound = false;
    for (const lesson of perLesson) {
      const question = lesson.questions[round];
      if (question) {
        interleaved.push({
          lessonSlug: lesson.slug,
          lessonTitle: lesson.title,
          question,
        });
        addedThisRound = true;
      }
    }
    round += 1;
  }

  if (interleaved.length === 0 || problemCount <= 0) return [];

  const sequence: ActAssignedPracticeItem[] = [];
  for (let i = 0; i < problemCount; i += 1) {
    const source = interleaved[i % interleaved.length];
    sequence.push({ position: i + 1, ...source });
  }
  return sequence;
}

export type WritingPracticeSetSource = 'ai' | 'static' | 'mixed';

/**
 * ACT version of {@link buildGeneratedPracticeSequence}: generates novel ACT
 * questions per skill (grounded in its rule + example sentences), interleaves
 * them across the selected skills, and falls back to the offline ACT bank for
 * any skill the generator couldn't produce.
 */
export async function buildGeneratedActPracticeSequence(
  lessonSlugs: string[],
  problemCount: number
): Promise<{
  items: ActAssignedPracticeItem[];
  source: WritingPracticeSetSource;
}> {
  const lessons = lessonSlugs
    .map((slug) => {
      const context = getQuickWritingLessonContext(slug);
      if (!context) return null;
      return {
        slug,
        title: context.title,
        skill: context.skill,
        rule: context.rule,
        staticQuestions: getActPracticeQuestions(slug),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (lessons.length === 0 || problemCount <= 0) {
    return { items: [], source: 'static' };
  }

  const perLesson = Math.ceil(problemCount / lessons.length);
  let anyAi = false;
  let anyStatic = false;

  const pools = await Promise.all(
    lessons.map(async (lesson) => {
      const generated = await generateActPracticeQuestions({
        lessonSlug: lesson.slug,
        skill: lesson.skill,
        lessonTitle: lesson.title,
        rule: lesson.rule,
        exampleSentences: lesson.staticQuestions
          .slice(0, 3)
          .map((question) => question.sentence),
        count: perLesson,
      });

      if (generated.length > 0) {
        anyAi = true;
        return { lesson, questions: generated };
      }

      anyStatic = true;
      return { lesson, questions: lesson.staticQuestions };
    })
  );

  const items: ActAssignedPracticeItem[] = [];
  let round = 0;
  while (items.length < problemCount) {
    let addedThisRound = false;
    for (const { lesson, questions } of pools) {
      if (items.length >= problemCount) break;
      if (questions.length === 0) continue;
      items.push({
        position: items.length + 1,
        lessonSlug: lesson.slug,
        lessonTitle: lesson.title,
        question: questions[round % questions.length],
      });
      addedThisRound = true;
    }
    if (!addedThisRound) break;
    round += 1;
  }

  const source: WritingPracticeSetSource = anyAi
    ? anyStatic
      ? 'mixed'
      : 'ai'
    : 'static';
  return { items, source };
}

/**
 * Builds a fresh practice sequence for an assignment: generates novel prompts
 * per skill (grounded in its rule + existing prompts), interleaves them across
 * the selected skills, and falls back to the static bank for any skill the
 * generator couldn't produce. Returns the items plus which source(s) were used.
 */
export async function buildGeneratedPracticeSequence(
  lessonSlugs: string[],
  problemCount: number
): Promise<{
  items: AssignedPracticeItem[];
  source: WritingPracticeSetSource;
}> {
  const lessons = lessonSlugs
    .map((slug) => {
      const context = getQuickWritingLessonContext(slug);
      if (!context) return null;
      return {
        slug,
        title: context.title,
        skill: context.skill,
        rule: context.rule,
        staticPrompts: getQuickWritingPracticePrompts(slug),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  if (lessons.length === 0 || problemCount <= 0) {
    return { items: [], source: 'static' };
  }

  const perLesson = Math.ceil(problemCount / lessons.length);
  let anyAi = false;
  let anyStatic = false;

  const pools = await Promise.all(
    lessons.map(async (lesson) => {
      const generated = await generatePracticePrompts({
        skill: lesson.skill,
        lessonTitle: lesson.title,
        rule: lesson.rule,
        exampleExercises: lesson.staticPrompts.map((prompt) => prompt.exercise),
        count: perLesson,
      });

      if (generated.length > 0) {
        anyAi = true;
        return {
          lesson,
          prompts: generated.map((prompt, index) => ({
            id: `${lesson.slug}-gen-${index + 1}`,
            exercise: prompt.exercise,
            instruction: prompt.instruction,
          })),
        };
      }

      anyStatic = true;
      return { lesson, prompts: lesson.staticPrompts };
    })
  );

  const items: AssignedPracticeItem[] = [];
  let round = 0;
  while (items.length < problemCount) {
    let addedThisRound = false;
    for (const { lesson, prompts } of pools) {
      if (items.length >= problemCount) break;
      if (prompts.length === 0) continue;
      items.push({
        position: items.length + 1,
        lessonSlug: lesson.slug,
        lessonTitle: lesson.title,
        prompt: prompts[round % prompts.length],
      });
      addedThisRound = true;
    }
    if (!addedThisRound) break;
    round += 1;
  }

  const source: WritingPracticeSetSource = anyAi
    ? anyStatic
      ? 'mixed'
      : 'ai'
    : 'static';
  return { items, source };
}

/**
 * One item in a student's assigned-practice sequence. Grammar skills drill ACT
 * multiple choice; composition skills are constructed response. Sets stored
 * before composition joined the assignment flow have no `kind` — treat those
 * items as ACT.
 */
export type MixedAssignedPracticeItem =
  | (ActAssignedPracticeItem & { kind?: 'act' })
  | {
      kind: 'composition';
      position: number;
      lessonSlug: string;
      lessonTitle: string;
      prompt: QuickWritingPracticePrompt;
    };

/**
 * Expands an assignment into a practice sequence that can mix skill kinds:
 * grammar slugs become interleaved ACT items, composition slugs become
 * interleaved constructed-response items, and when both are present the two
 * streams alternate so mixed assignments switch between answering and writing.
 */
export async function buildMixedGeneratedPracticeSequence(
  lessonSlugs: string[],
  problemCount: number
): Promise<{
  items: MixedAssignedPracticeItem[];
  source: WritingPracticeSetSource;
}> {
  const grammarSlugs: string[] = [];
  const compositionSlugs: string[] = [];
  for (const slug of lessonSlugs) {
    const lesson = getQuickWritingLessonBySlug(slug);
    if (!lesson) continue;
    if (lesson.section === 'Composition') compositionSlugs.push(slug);
    else grammarSlugs.push(slug);
  }

  if (compositionSlugs.length === 0) {
    const act = await buildGeneratedActPracticeSequence(
      grammarSlugs,
      problemCount
    );
    return {
      items: act.items.map((item) => ({ ...item, kind: 'act' as const })),
      source: act.source,
    };
  }

  if (grammarSlugs.length === 0) {
    const composed = await buildGeneratedPracticeSequence(
      compositionSlugs,
      problemCount
    );
    return {
      items: composed.items.map((item) => ({
        kind: 'composition' as const,
        position: item.position,
        lessonSlug: item.lessonSlug,
        lessonTitle: item.lessonTitle,
        prompt: item.prompt,
      })),
      source: composed.source,
    };
  }

  // Both kinds: split the problem count proportionally to how many skills of
  // each kind were selected (each side gets at least one problem), then
  // alternate between the two streams.
  const totalSlugs = grammarSlugs.length + compositionSlugs.length;
  const grammarCount = Math.min(
    problemCount - 1,
    Math.max(1, Math.round((problemCount * grammarSlugs.length) / totalSlugs))
  );
  const compositionCount = problemCount - grammarCount;

  const [act, composed] = await Promise.all([
    buildGeneratedActPracticeSequence(grammarSlugs, grammarCount),
    buildGeneratedPracticeSequence(compositionSlugs, compositionCount),
  ]);

  const actItems: MixedAssignedPracticeItem[] = act.items.map((item) => ({
    ...item,
    kind: 'act' as const,
  }));
  const compositionItems: MixedAssignedPracticeItem[] = composed.items.map(
    (item) => ({
      kind: 'composition' as const,
      position: item.position,
      lessonSlug: item.lessonSlug,
      lessonTitle: item.lessonTitle,
      prompt: item.prompt,
    })
  );

  const items: MixedAssignedPracticeItem[] = [];
  const maxLength = Math.max(actItems.length, compositionItems.length);
  for (let i = 0; i < maxLength; i += 1) {
    const actItem = actItems[i];
    if (actItem) items.push(actItem);
    const compositionItem = compositionItems[i];
    if (compositionItem) items.push(compositionItem);
  }
  const renumbered = items
    .slice(0, problemCount)
    .map((item, index) => ({ ...item, position: index + 1 }));

  const sources = new Set([act.source, composed.source]);
  const source: WritingPracticeSetSource =
    sources.size === 1 ? act.source : 'mixed';
  return { items: renumbered, source };
}

/**
 * Returns the student's stored practice sequence for an assignment, generating
 * and persisting it on first access so their prompts stay stable across reloads
 * and don't repeat across the assignment.
 */
export async function getOrCreateStudentPracticeSet(params: {
  classAssignmentId: string;
  membershipId: string;
  lessonSlugs: string[];
  problemCount: number;
}): Promise<MixedAssignedPracticeItem[]> {
  const { withAdvisorySingleFlight } = await import('~/utils/rate-limit.server');
  const where = {
    classAssignmentId_membershipId: {
      classAssignmentId: params.classAssignmentId,
      membershipId: params.membershipId,
    },
  };

  const existing = await prisma.writingPracticePromptSet.findUnique({ where });
  if (existing) {
    return existing.promptsJson as unknown as MixedAssignedPracticeItem[];
  }

  const { items, source } = await withAdvisorySingleFlight(
    `practice-set:${params.classAssignmentId}:${params.membershipId}`,
    () => buildMixedGeneratedPracticeSequence(
      params.lessonSlugs,
      params.problemCount
    )
  );

  try {
    const created = await prisma.writingPracticePromptSet.create({
      data: {
        classAssignmentId: params.classAssignmentId,
        membershipId: params.membershipId,
        source,
        promptsJson: items as unknown as object,
      },
    });
    return created.promptsJson as unknown as MixedAssignedPracticeItem[];
  } catch {
    // A concurrent request may have created the set first; re-read it.
    const raced = await prisma.writingPracticePromptSet.findUnique({ where });
    return (
      (raced?.promptsJson as unknown as MixedAssignedPracticeItem[]) ?? items
    );
  }
}

export type CreateWritingPracticeAssignmentInput = {
  createdByMembershipId: string;
  title: string;
  /** One slug = massed practice on a single skill; several = interleaved. */
  lessonSlugs: string[];
  problemCount: number;
  dueAt: Date;
  instructions?: string | null;
};

/**
 * Creates a teacher's writing-practice assignment and deploys it to the given
 * classes in one atomic write, mirroring the Assignment -> ClassAssignment
 * fan-out. Class ids are de-duplicated.
 */
export async function createWritingPracticeAssignmentForClasses(
  input: CreateWritingPracticeAssignmentInput,
  classIds: string[]
) {
  const uniqueClassIds = [...new Set(classIds)];

  return prisma.writingPracticeAssignment.create({
    data: {
      createdByMembershipId: input.createdByMembershipId,
      title: input.title,
      lessonSlugs: input.lessonSlugs,
      problemCount: input.problemCount,
      dueAt: input.dueAt,
      instructions: input.instructions ?? null,
      classAssignments: {
        create: uniqueClassIds.map((classId) => ({ classId })),
      },
    },
    include: { classAssignments: true },
  });
}

export type WritingPracticeAssignmentClassSummary = {
  id: string;
  title: string | null;
  grade: string | null;
  period: string | null;
  /**
   * The WritingPracticeClassAssignment id for this class — the id the assigned
   * practice runner and the teacher results page are keyed by. Without it the
   * index can only link to the generic lesson page, which is not the
   * assignment.
   */
  classAssignmentId: string;
};

export type WritingPracticeAssignmentSummary = {
  id: string;
  title: string;
  lessonSlugs: string[];
  problemCount: number;
  dueAt: Date;
  instructions: string | null;
  classes: WritingPracticeAssignmentClassSummary[];
};

type ClassFilter = { isArchived: false; [key: string]: unknown };

function assignmentSummarySelect(classFilter: ClassFilter) {
  return {
    id: true,
    title: true,
    lessonSlugs: true,
    problemCount: true,
    dueAt: true,
    instructions: true,
    classAssignments: {
      where: { class: classFilter },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        class: {
          select: { id: true, title: true, grade: true, period: true },
        },
      },
    },
  } as const;
}

type AssignmentSummaryRow = {
  id: string;
  title: string;
  lessonSlugs: string[];
  problemCount: number;
  dueAt: Date;
  instructions: string | null;
  classAssignments: {
    id: string;
    class: Omit<WritingPracticeAssignmentClassSummary, 'classAssignmentId'>;
  }[];
};

function toAssignmentSummary(
  row: AssignmentSummaryRow
): WritingPracticeAssignmentSummary {
  const { classAssignments, ...assignment } = row;
  return {
    ...assignment,
    classes: classAssignments.map((classAssignment) => ({
      ...classAssignment.class,
      classAssignmentId: classAssignment.id,
    })),
  };
}

async function listWritingPracticeAssignments(classFilter: ClassFilter) {
  const assignments = await prisma.writingPracticeAssignment.findMany({
    where: { classAssignments: { some: { class: classFilter } } },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
    select: assignmentSummarySelect(classFilter),
  });

  return assignments.map(toAssignmentSummary);
}

/** Practice a teacher assigned, soonest due first, excluding archived classes. */
export function listWritingPracticeAssignmentsForTeacher(
  membershipId: string
): Promise<WritingPracticeAssignmentSummary[]> {
  return listWritingPracticeAssignments({
    isArchived: false,
    teachers: { some: { id: membershipId } },
  });
}

/** Practice assigned to a student's active classes, soonest due first. */
export function listWritingPracticeAssignmentsForStudent(
  membershipId: string
): Promise<WritingPracticeAssignmentSummary[]> {
  return listWritingPracticeAssignments({
    isArchived: false,
    students: { some: { id: membershipId } },
  });
}

export type RecordWritingPracticeAttemptInput = {
  classAssignmentId: string;
  membershipId: string;
  lessonSlug: string;
  question: ActPracticeQuestion;
  selectedChoiceIndex: number;
  grade: ActGradeResult;
};

/**
 * Persists a single ACT practice attempt. The question and the student's choice
 * are snapshotted (the full ACT record lives in `feedbackJson`) so the record
 * stays meaningful even if lesson content later changes. `status` reuses the
 * existing feedback vocabulary — `strong` when correct, `needs_revision` when
 * not — so the teacher roll-up keeps working unchanged.
 */
export async function recordWritingPracticeAttempt(
  input: RecordWritingPracticeAttemptInput
) {
  const { question, selectedChoiceIndex, grade } = input;
  const record: ActAttemptRecord = {
    kind: 'act',
    sentence: question.sentence,
    underline: question.underline,
    choices: question.choices,
    selectedChoiceIndex,
    correctChoiceIndex: grade.correctChoiceIndex,
    correct: grade.correct,
    explanation: grade.explanation,
  };

  return prisma.writingPracticeAttempt.create({
    data: {
      classAssignmentId: input.classAssignmentId,
      membershipId: input.membershipId,
      lessonSlug: input.lessonSlug,
      promptId: question.id,
      exercise: question.sentence,
      instruction: question.underline,
      response: question.choices[selectedChoiceIndex] ?? '',
      status: grade.correct ? 'strong' : 'needs_revision',
      feedbackJson: record,
    },
  });
}

export type RecordCompositionPracticeAttemptInput = {
  classAssignmentId: string;
  membershipId: string;
  lessonSlug: string;
  prompt: QuickWritingPracticePrompt;
  response: string;
  feedback: PracticeFeedbackResult;
};

/**
 * Persists a constructed-response (composition) practice attempt: the prompt
 * snapshot, the student's writing, and the tutor feedback it earned. `status`
 * is the tutor's verdict, which the teacher roll-up already understands.
 */
export async function recordCompositionPracticeAttempt(
  input: RecordCompositionPracticeAttemptInput
) {
  const record: CompositionAttemptRecord = {
    kind: 'composition',
    exercise: input.prompt.exercise,
    instruction: input.prompt.instruction,
    response: input.response,
    ...input.feedback,
  };

  return prisma.writingPracticeAttempt.create({
    data: {
      classAssignmentId: input.classAssignmentId,
      membershipId: input.membershipId,
      lessonSlug: input.lessonSlug,
      promptId: input.prompt.id,
      exercise: input.prompt.exercise,
      instruction: input.prompt.instruction,
      response: input.response,
      status: input.feedback.status,
      feedbackJson: record,
    },
  });
}

/**
 * The writing-practice class-assignments visible to a student, newest first,
 * with that student's own attempts attached for progress display.
 */
export async function getAssignedPracticeForStudent(membershipId: string) {
  return prisma.writingPracticeClassAssignment.findMany({
    where: { class: { students: { some: { id: membershipId } } } },
    include: {
      assignment: true,
      class: {
        select: { id: true, grade: true, period: true, title: true },
      },
      attempts: {
        where: { membershipId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          lessonSlug: true,
          promptId: true,
          status: true,
          createdAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/** A single writing-practice class-assignment a student can open, if enrolled. */
export async function getAssignedPracticeForStudentById(
  classAssignmentId: string,
  membershipId: string
) {
  return prisma.writingPracticeClassAssignment.findFirst({
    where: {
      id: classAssignmentId,
      class: { students: { some: { id: membershipId } } },
    },
    include: {
      assignment: true,
      attempts: {
        where: { membershipId },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

/**
 * The writing-practice deployments across a teacher's classes, newest first,
 * with class info and an attempt count for at-a-glance progress.
 */
export async function getWritingPracticeAssignmentsForTeacher(
  membershipId: string
) {
  return prisma.writingPracticeClassAssignment.findMany({
    where: { class: { teachers: { some: { id: membershipId } } } },
    include: {
      assignment: true,
      class: {
        select: { id: true, title: true, period: true, grade: true },
      },
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export type WritingPracticeStudentResult = {
  membershipId: string;
  name: string | null;
  email: string;
  /** Distinct problems the student has submitted at least once (revisions of
   *  the same prompt count once). */
  attemptCount: number;
  /** Distinct problems the student has demonstrated mastery on (a `strong`
   *  attempt). Composition problems are "done" only once mastered; ACT
   *  problems are done as soon as they're answered. */
  masteredCount: number;
  completed: boolean;
  latestStatus: string | null;
};

type ProgressAttempt = {
  promptId: string;
  lessonSlug: string;
  status: string;
};

export type AssignedProgress = {
  /** Distinct prompts attempted (revisions collapsed). */
  attemptedCount: number;
  /** Distinct prompts with a `strong` attempt. */
  masteredCount: number;
  /** Distinct prompts "done": mastered for composition, attempted for ACT. */
  doneCount: number;
};

/**
 * Collapses a student's raw attempt rows (which include every revision) into
 * per-problem progress. A composition problem counts as done only once it has
 * a `strong` attempt — so a wrong-then-abandoned answer never reads as
 * complete — while an ACT problem is done as soon as it is answered, preserving
 * the multiple-choice flow. Mastery is tracked for both.
 */
export function computeAssignedProgress(
  attempts: ProgressAttempt[]
): AssignedProgress {
  const byPrompt = new Map<string, { lessonSlug: string; mastered: boolean }>();
  for (const attempt of attempts) {
    const existing = byPrompt.get(attempt.promptId);
    byPrompt.set(attempt.promptId, {
      lessonSlug: attempt.lessonSlug,
      mastered: (existing?.mastered ?? false) || attempt.status === 'strong',
    });
  }

  let attemptedCount = 0;
  let masteredCount = 0;
  let doneCount = 0;
  for (const { lessonSlug, mastered } of byPrompt.values()) {
    attemptedCount += 1;
    if (mastered) masteredCount += 1;
    const isComposition =
      getQuickWritingLessonBySlug(lessonSlug)?.section === 'Composition';
    if (isComposition ? mastered : true) doneCount += 1;
  }
  return { attemptedCount, masteredCount, doneCount };
}

/**
 * One recorded student attempt: an ACT question + their pick + the grade, or a
 * composition prompt + their writing + the tutor feedback.
 */
export type WritingPracticeAttemptDetail = {
  id: string;
  lessonSlug: string;
  promptId: string;
  status: string;
  attempt: ActAttemptRecord | CompositionAttemptRecord;
  createdAt: Date;
};

/**
 * Rolls a class-assignment's attempts up into one row per enrolled student:
 * how many problems they have submitted, whether they've met the target, and
 * their most recent feedback status. Students with no attempts are included
 * (so teachers can see who hasn't started), sorted by email.
 */
export function summarizeWritingPracticeResults(params: {
  students: Array<{ id: string; user: { name: string | null; email: string } }>;
  attempts: Array<{
    membershipId: string;
    promptId: string;
    lessonSlug: string;
    status: string;
    createdAt: Date;
  }>;
  problemCount: number;
}): WritingPracticeStudentResult[] {
  const byStudent = new Map<
    string,
    {
      attempts: ProgressAttempt[];
      latestStatus: string;
      latestAt: Date;
    }
  >();
  for (const attempt of params.attempts) {
    const existing = byStudent.get(attempt.membershipId);
    const progressAttempt: ProgressAttempt = {
      promptId: attempt.promptId,
      lessonSlug: attempt.lessonSlug,
      status: attempt.status,
    };
    if (!existing) {
      byStudent.set(attempt.membershipId, {
        attempts: [progressAttempt],
        latestStatus: attempt.status,
        latestAt: attempt.createdAt,
      });
      continue;
    }
    existing.attempts.push(progressAttempt);
    if (attempt.createdAt >= existing.latestAt) {
      existing.latestStatus = attempt.status;
      existing.latestAt = attempt.createdAt;
    }
  }

  return params.students
    .map((student) => {
      const summary = byStudent.get(student.id);
      const progress = computeAssignedProgress(summary?.attempts ?? []);
      return {
        membershipId: student.id,
        name: student.user.name,
        email: student.user.email,
        attemptCount: progress.attemptedCount,
        masteredCount: progress.masteredCount,
        completed: progress.doneCount >= params.problemCount,
        latestStatus: summary?.latestStatus ?? null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

/**
 * A teacher's view of one deployment: the assignment/class plus a per-student
 * progress roll-up. Returns `null` if the class-assignment does not belong to a
 * class this teacher teaches.
 */
export async function getWritingPracticeResultsForTeacher(
  classAssignmentId: string,
  teacherMembershipId: string
) {
  const classAssignment = await prisma.writingPracticeClassAssignment.findFirst(
    {
      where: {
        id: classAssignmentId,
        class: { teachers: { some: { id: teacherMembershipId } } },
      },
      include: {
        assignment: true,
        class: {
          select: {
            id: true,
            title: true,
            grade: true,
            period: true,
            students: {
              select: {
                id: true,
                user: { select: { name: true, email: true } },
              },
            },
          },
        },
        attempts: {
          select: {
            id: true,
            membershipId: true,
            lessonSlug: true,
            promptId: true,
            exercise: true,
            instruction: true,
            response: true,
            status: true,
            feedbackJson: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }
  );
  if (!classAssignment) return null;

  const results = summarizeWritingPracticeResults({
    students: classAssignment.class.students,
    attempts: classAssignment.attempts,
    problemCount: classAssignment.assignment.problemCount,
  });

  // Group each student's ACT attempts (question + their pick + the grade) so the
  // teacher can see exactly what a student chose and whether it was right.
  const attemptsByStudent: Record<string, WritingPracticeAttemptDetail[]> = {};
  for (const attempt of classAssignment.attempts) {
    const detail: WritingPracticeAttemptDetail = {
      id: attempt.id,
      lessonSlug: attempt.lessonSlug,
      promptId: attempt.promptId,
      status: attempt.status,
      attempt: attempt.feedbackJson as unknown as
        | ActAttemptRecord
        | CompositionAttemptRecord,
      createdAt: attempt.createdAt,
    };
    (attemptsByStudent[attempt.membershipId] ??= []).push(detail);
  }

  return { classAssignment, results, attemptsByStudent };
}
