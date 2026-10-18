import type { SubmissionRubricEntry } from './aggregate-rubric-performance';
import type { ClassModelInput } from './select-class-models';
import { prisma } from '~/utils/db.server';

/**
 * Every student's latest graded submission on a class assignment, shaped for
 * the models picker. The caller has already checked the actor may see them.
 */
export async function loadClassModelInputs(
  classAssignmentId: string
): Promise<ClassModelInput[]> {
  const documents = await prisma.document.findMany({
    where: { classAssignmentId, deletedAt: null },
    select: {
      id: true,
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
      group: { select: { label: true } },
      submissions: {
        where: { gradedAt: { not: null } },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { id: true, text: true, html: true, rubricScores: true },
      },
    },
  });

  return documents.flatMap((doc) => {
    const submission = doc.submissions[0];
    if (!submission) return [];
    return [
      {
        submissionId: submission.id,
        studentName:
          doc.group?.label?.trim() ||
          doc.membership?.user?.name?.trim() ||
          doc.membership?.user?.email?.trim() ||
          null,
        href: `/app/submissions/${submission.id}`,
        text: submission.text,
        html: submission.html,
        rubricScores: submission.rubricScores as Record<
          string,
          SubmissionRubricEntry
        > | null,
      },
    ];
  });
}
