import { prisma } from '~/utils/db.server';

import type { PracticeFeedbackResult } from './practice-feedback.shared';
import {
  getQuickWritingLessonBySlug,
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
  lessonSlug: string;
  promptId: string;
  exercise: string;
  instruction: string;
  response: string;
  feedback: PracticeFeedbackResult;
};

/**
 * Persists a single student practice attempt together with the feedback it
 * produced. The prompt text is snapshotted so the record stays meaningful even
 * if lesson content later changes.
 */
export async function recordWritingPracticeAttempt(
  input: RecordWritingPracticeAttemptInput
) {
  return prisma.writingPracticeAttempt.create({
    data: {
      classAssignmentId: input.classAssignmentId,
      membershipId: input.membershipId,
      lessonSlug: input.lessonSlug,
      promptId: input.promptId,
      exercise: input.exercise,
      instruction: input.instruction,
      response: input.response,
      status: input.feedback.status,
      feedbackJson: input.feedback,
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
  attemptCount: number;
  completed: boolean;
  latestStatus: string | null;
};

/**
 * Rolls a class-assignment's attempts up into one row per enrolled student:
 * how many problems they have submitted, whether they've met the target, and
 * their most recent feedback status. Students with no attempts are included
 * (so teachers can see who hasn't started), sorted by email.
 */
export function summarizeWritingPracticeResults(params: {
  students: Array<{ id: string; user: { name: string | null; email: string } }>;
  attempts: Array<{ membershipId: string; status: string; createdAt: Date }>;
  problemCount: number;
}): WritingPracticeStudentResult[] {
  const byStudent = new Map<
    string,
    { count: number; latestStatus: string; latestAt: Date }
  >();
  for (const attempt of params.attempts) {
    const existing = byStudent.get(attempt.membershipId);
    if (!existing) {
      byStudent.set(attempt.membershipId, {
        count: 1,
        latestStatus: attempt.status,
        latestAt: attempt.createdAt,
      });
      continue;
    }
    existing.count += 1;
    if (attempt.createdAt >= existing.latestAt) {
      existing.latestStatus = attempt.status;
      existing.latestAt = attempt.createdAt;
    }
  }

  return params.students
    .map((student) => {
      const summary = byStudent.get(student.id);
      const attemptCount = summary?.count ?? 0;
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
          select: { membershipId: true, status: true, createdAt: true },
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

  return { classAssignment, results };
}
