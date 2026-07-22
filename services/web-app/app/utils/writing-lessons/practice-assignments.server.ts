import { Prisma } from '@app/prisma';
import { createHash } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import {
  AiRateLimitError,
  reserveAiRequest,
  WRITING_AI_ADMISSION_POLICY,
} from '~/utils/ai-admission.server';

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

function interleaveMixedPracticeItems(
  actItems: MixedAssignedPracticeItem[],
  compositionItems: MixedAssignedPracticeItem[],
  problemCount: number
): MixedAssignedPracticeItem[] {
  const items: MixedAssignedPracticeItem[] = [];
  const maxLength = Math.max(actItems.length, compositionItems.length);
  for (let i = 0; i < maxLength && items.length < problemCount; i += 1) {
    const actItem = actItems[i];
    if (actItem) items.push(actItem);
    const compositionItem = compositionItems[i];
    if (compositionItem && items.length < problemCount) {
      items.push(compositionItem);
    }
  }
  return items.map((item, index) => ({ ...item, position: index + 1 }));
}

/** Builds the same mixed shape without making any provider request. */
export function buildMixedStaticPracticeSequence(
  lessonSlugs: string[],
  problemCount: number
): MixedAssignedPracticeItem[] {
  const grammarSlugs: string[] = [];
  const compositionSlugs: string[] = [];
  for (const slug of lessonSlugs) {
    const lesson = getQuickWritingLessonBySlug(slug);
    if (!lesson) continue;
    if (lesson.section === 'Composition') compositionSlugs.push(slug);
    else grammarSlugs.push(slug);
  }

  const total = grammarSlugs.length + compositionSlugs.length;
  if (total === 0 || problemCount <= 0) return [];
  const grammarCount =
    compositionSlugs.length === 0
      ? problemCount
      : grammarSlugs.length === 0
        ? 0
        : Math.min(
            problemCount - 1,
            Math.max(
              1,
              Math.round((problemCount * grammarSlugs.length) / total)
            )
          );
  const compositionCount = problemCount - grammarCount;
  const actItems: MixedAssignedPracticeItem[] = buildActPracticeSequence(
    grammarSlugs,
    grammarCount
  ).map((item) => ({ ...item, kind: 'act' as const }));
  const compositionItems: MixedAssignedPracticeItem[] =
    buildAssignedPracticeSequence(compositionSlugs, compositionCount).map(
      (item) => ({
        kind: 'composition' as const,
        position: item.position,
        lessonSlug: item.lessonSlug,
        lessonTitle: item.lessonTitle,
        prompt: item.prompt,
      })
    );
  return interleaveMixedPracticeItems(actItems, compositionItems, problemCount);
}

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

  const renumbered = interleaveMixedPracticeItems(
    actItems,
    compositionItems,
    problemCount
  );

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
  organizationId: string;
  lessonSlugs: string[];
  problemCount: number;
}): Promise<MixedAssignedPracticeItem[]> {
  const where = {
    classAssignmentId_membershipId: {
      classAssignmentId: params.classAssignmentId,
      membershipId: params.membershipId,
    },
  };

  const lockKey = `writing-practice-prompt-set:${params.classAssignmentId}:${params.membershipId}`;
  return prisma.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`
        SELECT 1::integer AS "locked"
        FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
      `;

      const existing = await transaction.writingPracticePromptSet.findUnique({
        where,
      });
      if (existing) {
        return existing.promptsJson as unknown as MixedAssignedPracticeItem[];
      }

      let generated: {
        items: MixedAssignedPracticeItem[];
        source: WritingPracticeSetSource;
      };
      try {
        await reserveAiRequest({
          membershipId: params.membershipId,
          organizationId: params.organizationId,
          feature: 'writing-fundamentals-generation',
          policy: WRITING_AI_ADMISSION_POLICY,
          units: Math.max(1, new Set(params.lessonSlugs).size),
        });
        generated = await buildMixedGeneratedPracticeSequence(
          params.lessonSlugs,
          params.problemCount
        );
      } catch (error) {
        if (!(error instanceof AiRateLimitError)) throw error;
        generated = {
          items: buildMixedStaticPracticeSequence(
            params.lessonSlugs,
            params.problemCount
          ),
          source: 'static',
        };
      }
      const { items, source } = generated;

      const created = await transaction.writingPracticePromptSet.create({
        data: {
          classAssignmentId: params.classAssignmentId,
          membershipId: params.membershipId,
          source,
          promptsJson: items as unknown as object,
        },
      });
      return created.promptsJson as unknown as MixedAssignedPracticeItem[];
    },
    { maxWait: 5_000, timeout: 60_000 }
  );
}

/** Reads a stored practice set without reserving capacity or writing. */
export async function getStudentPracticeSet(params: {
  classAssignmentId: string;
  membershipId: string;
}): Promise<MixedAssignedPracticeItem[] | null> {
  const existing = await prisma.writingPracticePromptSet.findUnique({
    where: {
      classAssignmentId_membershipId: {
        classAssignmentId: params.classAssignmentId,
        membershipId: params.membershipId,
      },
    },
  });
  return existing
    ? (existing.promptsJson as unknown as MixedAssignedPracticeItem[])
    : null;
}

export type CreateWritingPracticeAssignmentInput = {
  createdByMembershipId: string;
  organizationId: string;
  title?: string | null;
  /** One slug = massed practice on a single skill; several = interleaved. */
  lessonSlugs: string[];
  problemCount: number;
  dueAt?: Date | null;
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
      organizationId: input.organizationId,
      title: input.title ?? null,
      lessonSlugs: input.lessonSlugs,
      problemCount: input.problemCount,
      dueAt: input.dueAt ?? null,
      instructions: input.instructions ?? null,
      classAssignments: {
        create: uniqueClassIds.map((classId) => ({ classId })),
      },
    },
    include: { classAssignments: true },
  });
}

export type RecordWritingPracticeAttemptInput = {
  classAssignmentId: string;
  membershipId: string;
  position: number;
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

  const create = {
    classAssignmentId: input.classAssignmentId,
    membershipId: input.membershipId,
    position: input.position,
    revision: 1,
    lessonSlug: input.lessonSlug,
    promptId: question.id,
    exercise: question.sentence,
    instruction: question.underline,
    response: question.choices[selectedChoiceIndex] ?? '',
    status: grade.correct ? 'strong' : 'needs_revision',
    feedbackJson: record,
  };

  return prisma.writingPracticeAttempt.upsert({
    where: {
      classAssignmentId_membershipId_position_revision: {
        classAssignmentId: input.classAssignmentId,
        membershipId: input.membershipId,
        position: input.position,
        revision: 1,
      },
    },
    // A retry must return the first immutable answer, not rewrite history.
    update: {},
    create,
  });
}

export type RecordCompositionPracticeAttemptInput = {
  classAssignmentId: string;
  membershipId: string;
  position: number;
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
  const normalizedResponse = input.response.trim().replace(/\r\n/g, '\n');
  const responseDigest = createHash('sha256')
    .update(normalizedResponse, 'utf8')
    .digest('hex');
  const record: CompositionAttemptRecord = {
    kind: 'composition',
    exercise: input.prompt.exercise,
    instruction: input.prompt.instruction,
    response: normalizedResponse,
    ...input.feedback,
  };

  const lockKey = `writing-practice-attempt:${input.classAssignmentId}:${input.membershipId}:${input.position}`;
  return prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`
      SELECT 1::integer AS "locked"
      FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;

    const duplicate = await transaction.writingPracticeAttempt.findFirst({
      where: {
        classAssignmentId: input.classAssignmentId,
        membershipId: input.membershipId,
        position: input.position,
        responseDigest,
      },
    });
    if (duplicate) return duplicate;

    const latest = await transaction.writingPracticeAttempt.findFirst({
      where: {
        classAssignmentId: input.classAssignmentId,
        membershipId: input.membershipId,
        position: input.position,
      },
      orderBy: { revision: 'desc' },
      select: { revision: true },
    });

    return transaction.writingPracticeAttempt.create({
      data: {
        classAssignmentId: input.classAssignmentId,
        membershipId: input.membershipId,
        position: input.position,
        revision: (latest?.revision ?? 0) + 1,
        responseDigest,
        lessonSlug: input.lessonSlug,
        promptId: input.prompt.id,
        exercise: input.prompt.exercise,
        instruction: input.prompt.instruction,
        response: normalizedResponse,
        status: input.feedback.status,
        feedbackJson: record,
      },
    });
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
      attempts: {
        where: { membershipId, countsTowardProgress: true },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          position: true,
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
        where: { membershipId, countsTowardProgress: true },
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
      _count: {
        select: {
          attempts: { where: { countsTowardProgress: true } },
        },
      },
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
  position: number;
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
  const byPosition = new Map<
    number,
    { lessonSlug: string; mastered: boolean }
  >();
  for (const attempt of attempts) {
    const existing = byPosition.get(attempt.position);
    byPosition.set(attempt.position, {
      lessonSlug: attempt.lessonSlug,
      mastered: (existing?.mastered ?? false) || attempt.status === 'strong',
    });
  }

  let attemptedCount = 0;
  let masteredCount = 0;
  let doneCount = 0;
  for (const { lessonSlug, mastered } of byPosition.values()) {
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
  position: number;
  revision: number;
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
    position: number;
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
      position: attempt.position,
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
          where: { countsTowardProgress: true },
          select: {
            id: true,
            membershipId: true,
            position: true,
            revision: true,
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
      position: attempt.position,
      revision: attempt.revision,
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
