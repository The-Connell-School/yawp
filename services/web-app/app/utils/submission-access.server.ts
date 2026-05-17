import { prisma } from '~/utils/db.server';

/** Owner, teacher of student's class, or admin — same visibility as submission page loader. */
export async function findSubmissionForTitleEdit(params: {
  submissionId: string;
  profileId: string;
  isAdmin: boolean;
}) {
  return prisma.submission.findFirst({
    where: {
      id: params.submissionId,
      document: {
        is: {
          deletedAt: null,
          OR: [
            { profile: { id: params.profileId } },
            {
              studentProfile: {
                classes: {
                  some: {
                    teachers: {
                      some: { profileId: params.profileId },
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
