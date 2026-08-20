import { prisma } from '~/utils/db.server';
import { hasMeaningfulGrade } from '~/utils/teacher-document-status';

export async function getTeacherClassCardStats(classId: string) {
  const documents = await prisma.document.findMany({
    where: {
      deletedAt: null,
      classAssignment: { classId },
    },
    select: {
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
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
      },
    },
  });
  const latestSubmissions = documents.flatMap(
    (document) => document.submissions
  );

  const ungradedCount = latestSubmissions.filter(
    (submission) =>
      !hasMeaningfulGrade(submission) && !submission.releasedAt
  ).length;

  const gradedUnreleasedCount = latestSubmissions.filter(
    (submission) =>
      hasMeaningfulGrade(submission) && !submission.releasedAt
  ).length;

  return { ungradedCount, gradedUnreleasedCount };
}
