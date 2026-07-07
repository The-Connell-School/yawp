import { prisma } from '~/utils/db.server';

import type { PracticeFeedbackResult } from './practice-feedback.shared';

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
