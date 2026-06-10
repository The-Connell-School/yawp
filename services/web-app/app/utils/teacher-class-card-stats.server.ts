import { prisma } from '~/utils/db.server';

function hasMeaningfulGrade(grade: {
  score: string | null;
  feedback: string | null;
  rubricScores?: unknown | null;
  overallComment?: string | null;
  numericPercentage?: number | null;
  letterGrade?: string | null;
}) {
  return Boolean(
    grade.score ||
      grade.feedback ||
      grade.overallComment ||
      grade.letterGrade ||
      grade.numericPercentage !== null ||
      (grade.rubricScores &&
        typeof grade.rubricScores === 'object' &&
        Object.keys(grade.rubricScores as Record<string, unknown>).length > 0)
  );
}

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
