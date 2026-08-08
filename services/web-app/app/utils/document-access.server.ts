import { type Prisma } from '@app/prisma';
import { prisma } from './db.server';
import { hasEffectivePlatformAdmin } from './preview-access.server';

/**
 * Authorization predicates for document-scoped data.
 *
 * These return Prisma `where` fragments rather than booleans on purpose. A post-fetch
 * `if (doc.membershipId !== profile.id)` is one refactor away from being dropped and
 * leaves the row already loaded in memory; folding the rule into the query means an
 * unauthorized caller never gets the row at all, and every call site that forgets the
 * scope fails loudly in review as a bare `findUnique`.
 *
 * Two rules exist, and they are not interchangeable:
 *
 * - READ scope (`documentReadWhere`) — the student who owns the document, plus any
 *   teacher of a class that student is enrolled in. Teachers legitimately read student
 *   work; grading depends on it.
 * - WRITE scope (`documentOwnerWhere`) — the owning student only. Tutor conversations
 *   and module progress are the student's own record of work. A teacher writing into
 *   them would fabricate student dialogue, so teachers are deliberately excluded.
 *
 * Platform admin is preserved in both, matching `hasEffectivePlatformAdmin`.
 */

export function documentReadWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return {
    OR: [
      { membershipId: profileId },
      {
        membership: {
          classesAsStudent: {
            some: { teachers: { some: { id: profileId } } },
          },
        },
      },
    ],
  };
}

export function documentOwnerWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { membershipId: profileId };
}

export async function getIsPlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return hasEffectivePlatformAdmin(user?.isAdmin);
}
