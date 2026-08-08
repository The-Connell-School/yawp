import { prisma } from '~/utils/db.server';
import { documentReadWhere } from '~/utils/document-access.server';

/** Owner, teacher of student's class, or admin — same visibility as submission page loader. */
export async function findSubmissionForTitleEdit(params: {
  submissionId: string;
  membershipId: string;
  isAdmin: boolean;
}) {
  return prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        is: {
          deletedAt: null,
          ...documentReadWhere({
            profileId: params.membershipId,
            isAdmin: params.isAdmin,
          }),
        },
      },
    },
    select: { id: true },
  });
}
