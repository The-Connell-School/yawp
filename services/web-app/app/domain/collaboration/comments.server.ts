import { prisma } from '~/utils/db.server';
import type { DraftComment } from './comments';

export type { DraftComment } from './comments';

/**
 * Comments on a shared draft.
 *
 * Teachers comment; they do not write in the draft. That was the rule from the
 * start, and it is why the collaborative page has no editor for them at all —
 * this is the channel that makes the rule liveable rather than merely
 * restrictive.
 *
 * Document-level rather than anchored to a highlight, deliberately. The
 * collaborative schema has no comment mark (see `schema.ts`), because adding one
 * would change the shared document's node set and bump the schema version, which
 * puts every open room into the stale-schema read-only state until every student
 * reloads. A comment anchored to a mark the document cannot carry would point at
 * text nobody can see.
 *
 * `DocumentComment` needs no schema change: it is already keyed to a document
 * with an author, and `documentReadWhere` already admits both the group's members
 * and their teacher.
 */

export class DraftCommentError extends Error {}

import { formatUserDisplayName } from '~/utils/user-display';

const authorName = (membership: {
  user: { name: string | null; email: string | null; username?: string | null };
}) => formatUserDisplayName(membership.user);

const requireContent = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) throw new DraftCommentError('Write something first.');
  return trimmed;
};

export async function listDraftComments({
  documentId,
  documentLevelOnly = false,
}: {
  documentId: string;
  /** Excludes comments anchored to a highlight the collaborative page cannot show. */
  documentLevelOnly?: boolean;
}): Promise<DraftComment[]> {
  const rows = await prisma.documentComment.findMany({
    where: {
      documentId,
      archivedAt: null,
      ...(documentLevelOnly ? { highlightId: null } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      content: true,
      createdAt: true,
      membershipId: true,
      membership: {
        select: { role: true, user: { select: { name: true, email: true } } },
      },
      responses: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          content: true,
          createdAt: true,
          membershipId: true,
          membership: {
            select: { role: true, user: { select: { name: true, email: true } } },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
    authorMembershipId: row.membershipId,
    authorName: authorName(row.membership),
    authorRole: row.membership.role,
    responses: row.responses.map((response) => ({
      id: response.id,
      content: response.content,
      createdAt: response.createdAt.toISOString(),
      authorMembershipId: response.membershipId,
      authorName: authorName(response.membership),
      authorRole: response.membership.role,
    })),
  }));
}

export async function addDraftComment({
  documentId,
  membershipId,
  content,
}: {
  documentId: string;
  membershipId: string;
  content: string;
}) {
  const trimmed = requireContent(content);

  const created = await prisma.documentComment.create({
    data: {
      documentId,
      membershipId,
      content: trimmed,
      // No mark to anchor to on this page; see the note above.
      highlightId: null,
    },
    select: { id: true },
  });

  return { commentId: created.id };
}

export async function replyToDraftComment({
  documentId,
  commentId,
  membershipId,
  content,
}: {
  documentId: string;
  commentId: string;
  membershipId: string;
  content: string;
}) {
  const trimmed = requireContent(content);

  // The comment id arrives from a form, so a reply must not be able to land on
  // another document's thread.
  const comment = await prisma.documentComment.findFirst({
    where: { id: commentId, documentId, archivedAt: null },
    select: { id: true },
  });
  if (!comment) {
    throw new DraftCommentError('That comment is no longer on this draft.');
  }

  await prisma.documentCommentResponse.create({
    data: { commentId, membershipId, content: trimmed },
  });

  return { replied: true as const };
}
