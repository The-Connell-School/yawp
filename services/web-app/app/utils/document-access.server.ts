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
 *
 * Every helper below starts by refusing an empty `profileId`. Prisma DROPS filter keys
 * whose value is `undefined`, so `{ membershipId: undefined }` does not mean "match
 * nothing", it means "no filter" — an OR arm that degrades to `{}` matches every row in
 * the table. A single call site that passes an unresolved profile id would therefore turn
 * an ownership predicate into a global read with no error and no failing test. The throw
 * is the only thing standing between that mistake and a full-table leak; do not soften it
 * into a silent `return { id: '__never__' }`.
 */

function requireProfileId(profileId: string, helper: string): void {
  if (!profileId || typeof profileId !== 'string') {
    throw new Error(`${helper} requires a non-empty profileId`);
  }
}

export function documentReadWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  requireProfileId(profileId, 'documentReadWhere');

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
  requireProfileId(profileId, 'documentOwnerWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { membershipId: profileId };
}

/**
 * The same owner rule, expressed against a model that hangs off a Document
 * (AssignmentModuleSession). Returns `{}` for a platform admin rather than an empty
 * relation filter, so no query ever carries a `document: { is: {} }` no-op.
 */
export function documentOwnerSessionWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.AssignmentModuleSessionWhereInput {
  requireProfileId(profileId, 'documentOwnerSessionWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { document: { is: { membershipId: profileId } } };
}

/**
 * The READ rule expressed against a DocumentComment. A comment thread is readable and
 * repliable by exactly the people who may read the document it is anchored in — the
 * owning student and the teachers of that student's classes — because a reply is part
 * of the same grading conversation the comment itself is.
 *
 * Returns `{}` for a platform admin for the same reason as `documentOwnerSessionWhere`:
 * so no query carries a `document: { is: {} }` no-op.
 */
export function documentCommentReadWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentCommentWhereInput {
  requireProfileId(profileId, 'documentCommentReadWhere');

  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return { document: { is: documentReadWhere({ profileId }) } };
}

export async function getIsPlatformAdmin(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });

  return hasEffectivePlatformAdmin(user?.isAdmin);
}
