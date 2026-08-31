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
 * Three rules exist, and they are not interchangeable:
 *
 * - READ scope (`documentReadWhere`) — the student who owns the document, its active
 *   co-authors, plus any teacher of a class the owning student is enrolled in. Teachers
 *   legitimately read student work; grading depends on it.
 * - AUTHOR scope (`documentAuthorWhere`) — the owner and the document's active
 *   co-authors. This is the collaborative write scope: it guards the shared draft
 *   itself. Teachers are excluded for the same reason they are excluded from owner
 *   scope.
 * - OWNER scope (`documentOwnerWhere`) — the owning student only. Tutor conversations
 *   and module progress are the student's own record of work. A teacher writing into
 *   them would fabricate student dialogue, so teachers are deliberately excluded — and
 *   co-authors are excluded by the same argument, since one student writing dialogue
 *   attributed to their partner is the same fabrication.
 *
 * Platform admin is preserved in all three, matching `hasEffectivePlatformAdmin`.
 *
 * Co-authorship is expressed through the document's collaboration group rather than a
 * document→membership join table, so the group roster is the single source of truth for
 * who may write. `removedAt: null` is load-bearing: a student the teacher moved to a
 * different group keeps their attributed text in the old draft but loses write access
 * to it.
 *
 * A document with no collaboration group — every document that existed before
 * collaborative drafts — matches the group clause for nobody, so these predicates
 * behave exactly as they did before for single-author work.
 */

/**
 * Active co-authorship through the document's collaboration group. Shared by the read
 * and author scopes so the two can never drift apart on who counts as a co-author.
 */
function activeGroupMemberClause(profileId: string): Prisma.DocumentWhereInput {
  return {
    group: {
      is: {
        members: {
          some: { membershipId: profileId, removedAt: null },
        },
      },
    },
  };
}

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
      activeGroupMemberClause(profileId),
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

/**
 * The collaborative write scope: the owner or an active co-author, and no teacher.
 *
 * For a document with no collaboration group this reduces to the same rule as
 * `documentOwnerWhere`, which is what keeps single-author documents behaving exactly as
 * they always have.
 */
export function documentAuthorWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.DocumentWhereInput {
  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return {
    OR: [{ membershipId: profileId }, activeGroupMemberClause(profileId)],
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

/**
 * The same owner rule, expressed against a model that hangs off a Document
 * (AssignmentModuleSession). Returns `{}` for a platform admin rather than an empty
 * relation filter, so no query ever carries a `document: { is: {} }` no-op.
 */
/**
 * The rule for "this module session is mine", on a shared draft or a solo one.
 *
 * Owner-scope is not enough once a document has co-authors: only the nominal
 * owner would reach the tutor and everyone else in the group would get a 404.
 * But widening it to every author is too much the other way — that would let one
 * student write into their partner's transcript.
 *
 * So: the session's own `membershipId` decides. A shared draft's sessions carry
 * one, and each student matches only their own. Solo sessions carry null, which
 * is why the owner branch stays — it is the whole of the old behaviour, intact.
 */
export function documentAuthorOwnSessionWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.AssignmentModuleSessionWhereInput {
  if (hasEffectivePlatformAdmin(isAdmin)) return {};

  return {
    OR: [
      // Solo: the session has no member of its own, so the document's owner owns
      // it. Unchanged from documentOwnerSessionWhere.
      {
        membershipId: null,
        document: { is: { membershipId: profileId } },
      },
      // Shared: the session names its student, and they must also still be an
      // active member of the group that owns the draft.
      {
        membershipId: profileId,
        document: { is: activeGroupMemberClause(profileId) },
      },
    ],
  };
}

export function documentOwnerSessionWhere({
  profileId,
  isAdmin,
}: {
  profileId: string;
  isAdmin?: boolean | null;
}): Prisma.AssignmentModuleSessionWhereInput {
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
