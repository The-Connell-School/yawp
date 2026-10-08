import { prisma } from '~/utils/db.server';
import type { ExitTicketResponseInput } from './exit-ticket-class-read';

/**
 * Each student's (or group's) latest submitted response to one class's exit
 * ticket. Ungraded tickets are included: every response is read and scored
 * whether or not the score goes in the gradebook.
 */
export async function loadExitTicketResponses(
  classAssignmentId: string
): Promise<ExitTicketResponseInput[]> {
  const documents = await prisma.document.findMany({
    where: { classAssignmentId, deletedAt: null },
    select: {
      membership: {
        select: { user: { select: { name: true, email: true } } },
      },
      group: { select: { label: true } },
      submissions: {
        where: { unsubmittedAt: null },
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: { text: true, rubricScores: true },
      },
    },
  });

  return documents.flatMap((doc) => {
    const submission = doc.submissions[0];
    if (!submission) return [];
    return [
      {
        studentName:
          doc.group?.label?.trim() ||
          doc.membership?.user?.name?.trim() ||
          doc.membership?.user?.email?.trim() ||
          null,
        rubricScores: submission.rubricScores,
        text: submission.text,
      },
    ];
  });
}
