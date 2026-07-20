import { prisma } from '~/utils/db.server';

import { getActPracticeQuestions } from './act-practice-bank';
import { generateActPracticeQuestions } from './act-practice-generation.server';
import type {
  ActAttemptRecord,
  ActGradeResult,
  ActPracticeQuestion,
} from './act-practice.shared';
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
 * Returns the student's stored practice sequence for an assignment, generating
 * and persisting it on first access so their prompts stay stable across reloads
 * and don't repeat across the assignment.
 */
export async function getOrCreateStudentPracticeSet(params: {
  classAssignmentId: string;
  membershipId: string;
  lessonSlugs: string[];
  problemCount: number;
}): Promise<ActAssignedPracticeItem[]> {
  const where = {
    classAssignmentId_membershipId: {
      classAssignmentId: params.classAssignmentId,
      membershipId: params.membershipId,
    },
  };

  const existing = await prisma.writingPracticePromptSet.findUnique({ where });
  if (existing) {
    return existing.promptsJson as unknown as ActAssignedPracticeItem[];
  }

  const { items, source } = await buildGeneratedActPracticeSequence(
    params.lessonSlugs,
    params.problemCount
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
    return created.promptsJson as unknown as ActAssignedPracticeItem[];
  } catch {
    // A concurrent request may have created the set first; re-read it.
    const raced = await prisma.writingPracticePromptSet.findUnique({ where });
    return (
      (raced?.promptsJson as unknown as ActAssignedPracticeItem[]) ?? items
    );
  }
}

export type CreateWritingPracticeAssignmentInput = {
  createdByMembershipId: string;
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
      classAssignmentId_membershipId_position: {
        classAssignmentId: input.classAssignmentId,
        membershipId: input.membershipId,
        position: input.position,
      },
    },
    // A retry must return the first immutable answer, not rewrite history.
    update: {},
    create,
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
        where: { membershipId },
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
  attemptCount: number;
  completed: boolean;
  latestStatus: string | null;
};

/** One recorded student attempt: which ACT question, their pick, and the grade. */
export type WritingPracticeAttemptDetail = {
  id: string;
  lessonSlug: string;
  promptId: string;
  status: string;
  attempt: ActAttemptRecord;
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
    status: string;
    createdAt: Date;
  }>;
  problemCount: number;
}): WritingPracticeStudentResult[] {
  const byStudent = new Map<
    string,
    {
      positions: Set<number>;
      latestStatus: string;
      latestAt: Date;
    }
  >();
  for (const attempt of params.attempts) {
    const existing = byStudent.get(attempt.membershipId);
    if (!existing) {
      byStudent.set(attempt.membershipId, {
        positions: new Set([attempt.position]),
        latestStatus: attempt.status,
        latestAt: attempt.createdAt,
      });
      continue;
    }
    existing.positions.add(attempt.position);
    if (attempt.createdAt >= existing.latestAt) {
      existing.latestStatus = attempt.status;
      existing.latestAt = attempt.createdAt;
    }
  }

  return params.students
    .map((student) => {
      const summary = byStudent.get(student.id);
      const attemptCount = summary?.positions.size ?? 0;
      return {
        membershipId: student.id,
        name: student.user.name,
        email: student.user.email,
        attemptCount,
        completed: attemptCount >= params.problemCount,
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
            position: true,
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
      attempt: attempt.feedbackJson as unknown as ActAttemptRecord,
      createdAt: attempt.createdAt,
    };
    (attemptsByStudent[attempt.membershipId] ??= []).push(detail);
  }

  return { classAssignment, results, attemptsByStudent };
}
