import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { buildTeacherDocumentAccessWhere } from '~/utils/grading-auth.server';

export function buildSubmissionTitleEditWhere(params: {
  submissionId: string;
  userId: string;
  membershipId: string;
  organizationId: string;
  isAdmin: boolean;
}): Prisma.SubmissionWhereInput {
  return {
    id: params.submissionId,
    document: {
      is: {
        deletedAt: null,
        OR: [
          { membership: { is: { userId: params.userId } } },
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
  };
}

/** Owner, teacher of student's class, or admin — same visibility as submission page loader. */
export async function findSubmissionForTitleEdit(params: {
  submissionId: string;
  userId: string;
  membershipId: string;
  organizationId: string;
  isAdmin: boolean;
}) {
  return prisma.submission.findFirst({
    where: buildSubmissionTitleEditWhere(params),
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
