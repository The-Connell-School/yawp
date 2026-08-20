import { prisma } from '~/utils/db.server';
import { buildTeacherDocumentAccessWhere } from '~/utils/grading-auth.server';

/** Owner, teacher of student's class, or admin — same visibility as submission page loader. */
export async function findSubmissionForTitleEdit(params: {
  submissionId: string;
  membershipId: string;
  organizationId: string;
  isAdmin: boolean;
}) {
  return prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        is: {
          deletedAt: null,
          OR: [
            { membershipId: params.membershipId },
            {
              ...buildTeacherDocumentAccessWhere({
                membershipId: params.membershipId,
                organizationId: params.organizationId,
              }),
            },
            ...(params.isAdmin ? [{}] : []),
          ],
        },
      },
    },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      releasedAt: true,
      document: {
        select: {
          membership: { select: { organizationId: true } },
        },
      },
    },
  });
}
