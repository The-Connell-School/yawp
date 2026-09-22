import { prisma } from '~/utils/db.server';

export type CreateWritingPracticeAssignmentInput = {
  createdByMembershipId: string;
  title: string;
  lessonSlugs: string[];
  problemCount: number;
  dueAt: Date;
  instructions?: string | null;
};

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
  classAssignments: { class: WritingPracticeAssignmentClassSummary }[];
};

function toAssignmentSummary(
  row: AssignmentSummaryRow
): WritingPracticeAssignmentSummary {
  const { classAssignments, ...assignment } = row;
  return {
    ...assignment,
    classes: classAssignments.map((classAssignment) => classAssignment.class),
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

/**
 * Practice a teacher has assigned, soonest due first. Archived classes drop out
 * so a retired class does not resurface here.
 */
export function listWritingPracticeAssignmentsForTeacher(
  membershipId: string
): Promise<WritingPracticeAssignmentSummary[]> {
  return listWritingPracticeAssignments({
    isArchived: false,
    teachers: { some: { id: membershipId } },
  });
}

/**
 * Practice assigned to the classes a student is enrolled in, soonest due first.
 */
export function listWritingPracticeAssignmentsForStudent(
  membershipId: string
): Promise<WritingPracticeAssignmentSummary[]> {
  return listWritingPracticeAssignments({
    isArchived: false,
    students: { some: { id: membershipId } },
  });
}
