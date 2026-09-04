import { requireMembership, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';
import {
  documentAuthorWhere,
  documentReadWhere,
  getIsPlatformAdmin,
} from '~/utils/document-access.server';
import { collaborationRoomWhere } from './room.server';

/**
 * Who may read from, and who may write to, a collaborative room.
 *
 * Shared by every endpoint the room has, because the alternative is worse than
 * the duplication it replaces: the document transport and the presence channel
 * carry different things about the same draft, and two copies of this predicate
 * are two chances for one to be widened and the other forgotten.
 *
 * The two scopes are not the same set, and the difference is the design:
 *
 * - **read** — the group, plus the teacher, who follows the draft live.
 * - **author** — the group only. A teacher comments on student work; they do
 *   not type in it, and they do not get a caret in it either.
 *
 * The room gate is checked before the scope so the two refusals stay
 * distinguishable: a document that is not a collaborative room is answered as
 * though these endpoints do not exist, while a reader who tried to write is
 * told what they may do instead.
 */
export type CollabRoomAccess =
  | { ok: true; profileId: string; isAdmin: boolean }
  | { ok: false; reason: 'missing-document' | 'not-a-room' | 'out-of-scope' };

export async function requireCollabRoomAccess(
  request: Request,
  documentId: string | undefined,
  scope: 'read' | 'author'
): Promise<CollabRoomAccess> {
  if (!documentId) return { ok: false, reason: 'missing-document' };

  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);
  const isAdmin = await getIsPlatformAdmin(userId);

  // Only an opened collaborative draft is addressable here at all: every
  // document that exists today stays with the solo editor, so these endpoints
  // cannot be pointed at one even by someone entitled to read it.
  const room = await prisma.document.findFirst({
    where: { id: documentId, ...collaborationRoomWhere() },
    select: { id: true },
  });

  if (!room) return { ok: false, reason: 'not-a-room' };

  const inScope = await prisma.document.findFirst({
    where: {
      id: documentId,
      ...(scope === 'author'
        ? documentAuthorWhere({ profileId: profile.id, isAdmin })
        : documentReadWhere({ profileId: profile.id, isAdmin })),
    },
    select: { id: true },
  });

  if (!inScope) return { ok: false, reason: 'out-of-scope' };

  return { ok: true, profileId: profile.id, isAdmin };
}
