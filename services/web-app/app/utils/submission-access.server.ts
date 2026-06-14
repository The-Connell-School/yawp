import { prisma } from '~/utils/db.server';

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
          OR: [
            { membershipId: params.membershipId },
            {
              membership: {
                classesAsStudent: {
                  some: {
                    teachers: {
                      some: { id: params.membershipId },
                    },
                  },
                },
              },
            },
            ...(params.isAdmin ? [{}] : []),
          ],
        },
      },
    },
    select: { id: true },
  });
}
