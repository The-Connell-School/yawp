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
