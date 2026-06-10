import { prisma } from '~/utils/db.server';
import { hasMeaningfulGrade } from '~/utils/teacher-document-status';

export async function getTeacherClassCardStats(classId: string) {
  const submissions = await prisma.submission.findMany({
    where: {
      document: {
        is: {
          deletedAt: null,
          assignment: { classId },
        },
      },
    },
    select: {
      score: true,
      feedback: true,
      rubricScores: true,
      overallComment: true,
      numericPercentage: true,
      letterGrade: true,
      releasedAt: true,
      gradedAt: true,
    },
  });

  const ungradedCount = submissions.filter(
    (submission) =>
      !hasMeaningfulGrade(submission) && !submission.releasedAt
  ).length;

  const gradedUnreleasedCount = submissions.filter(
    (submission) =>
      hasMeaningfulGrade(submission) && !submission.releasedAt
  ).length;

  return { ungradedCount, gradedUnreleasedCount };
}
