import { prisma } from '~/utils/db.server';
import {
  AUTHOR_COLOR_MEMBER_ORDER,
  buildAuthorColorScale,
} from './author-colors';
import {
  attributePresence,
  livePresence,
  readAwarenessUpdate,
  writeAwarenessUpdate,
  PRESENCE_TTL_MS,
  type LivePresence,
  type PresenceIdentity,
} from './presence';

/**
 * The presence store: who is in a shared draft and where their caret is.
 *
 * Separate from `room-store.server` on purpose. That store is the document —
 * append-only, permanent, replayed to everyone who ever opens the draft, and
 * the source of what the teacher grades. This one is a whiteboard: every row is
 * overwritten within seconds, deleted when its tab closes, and worth nothing
 * once it is stale. Putting a cursor position into the room's log would replay
 * it forever and fold it into the snapshot.
 */

/**
 * How many client states one request may carry.
 *
 * An editor posts exactly one — its own. The allowance above that is for a
 * client that batches a leave with a move, not an invitation to fan out.
 */
const MAX_CLIENTS_PER_REQUEST = 4;

/**
 * The name and colour a caret from this member should carry.
 *
 * Built from the group's current members, in the same order and by the same
 * function the roster avatars and the teacher's contribution panel use, so one
 * colour means one person on every surface: the caret in the paragraph, the
 * initials in the header, and the underlined runs on the grading page.
 *
 * Returns null when the member is not in the group, which is how a teacher
 * reading the draft gets no caret: they follow the writing, they are not one of
 * the writers.
 */
export async function presenceIdentityFor({
  documentId,
  membershipId,
}: {
  documentId: string;
  membershipId: string;
}): Promise<PresenceIdentity | null> {
  const group = await prisma.documentGroup.findFirst({
    where: { documentId },
    select: {
      members: {
        where: { removedAt: null },
        orderBy: AUTHOR_COLOR_MEMBER_ORDER,
        select: {
          membershipId: true,
          membership: { select: { user: { select: { name: true } } } },
        },
      },
    },
  });

  const members = group?.members ?? [];
  const member = members.find((row) => row.membershipId === membershipId);
  if (!member) return null;

  const scale = buildAuthorColorScale(members.map((row) => row.membershipId));

  return {
    membershipId,
    // Matches the roster avatars, which fall back to the same word rather than
    // rendering an empty label over someone's caret.
    name: member.membership.user.name?.trim() || 'Student',
    color: scale.get(membershipId) ?? '#3F6212',
  };
}

export type PublishPresenceResult =
  | { status: 'stored' }
  | { status: 'rejected'; reason: 'unreadable' | 'too-many-clients' };

/**
 * Records one editor's cursor, or clears it.
 *
 * The update is decoded, stripped to a caret and re-labelled with the identity
 * the *server* resolved before anything is stored — see `attributePresence`.
 * What comes back out of this table was never under the browser's control.
 *
 * A `null` state is a tab saying goodbye, and deletes the row rather than
 * storing an absence: the peers' own Yjs awareness clears the caret when the
 * client stops appearing in the live set, so there is nothing to keep.
 */
export async function publishPresence({
  documentId,
  membershipId,
  identity,
  update,
}: {
  documentId: string;
  membershipId: string;
  identity: PresenceIdentity;
  update: Uint8Array;
}): Promise<PublishPresenceResult> {
  let entries;
  try {
    entries = readAwarenessUpdate(update);
  } catch {
    return { status: 'rejected', reason: 'unreadable' };
  }

  if (entries.length > MAX_CLIENTS_PER_REQUEST) {
    return { status: 'rejected', reason: 'too-many-clients' };
  }

  for (const entry of attributePresence(entries, identity)) {
    const clientId = String(entry.clientId);

    if (entry.state === null) {
      // deleteMany rather than delete: a goodbye for a row that was already
      // swept must not throw on the way out of the page.
      await prisma.documentCollabPresence.deleteMany({
        where: { documentId, membershipId, clientId },
      });
      continue;
    }

    const state = Buffer.from(writeAwarenessUpdate([entry]));

    await prisma.documentCollabPresence.upsert({
      where: {
        documentId_membershipId_clientId: { documentId, membershipId, clientId },
      },
      create: { documentId, membershipId, clientId, state },
      // updatedAt is @updatedAt, so writing the same cursor twice still counts
      // as a heartbeat — which is exactly what an idle writer sends.
      update: { state },
    });
  }

  return { status: 'stored' };
}

/**
 * Everyone still live in this draft.
 *
 * The TTL is applied on read, not only by the sweep, so a caret's lifetime never
 * depends on a deletion having run. The sweep below only keeps the table small.
 */
export async function readPresence({
  documentId,
  now = new Date(),
}: {
  documentId: string;
  now?: Date;
}): Promise<LivePresence[]> {
  const rows = await prisma.documentCollabPresence.findMany({
    where: { documentId },
    select: {
      clientId: true,
      membershipId: true,
      state: true,
      updatedAt: true,
    },
  });

  const live = livePresence(
    rows.map((row) => ({ ...row, state: new Uint8Array(row.state) })),
    now
  );

  // Only when there is something to delete, so the common poll — everyone
  // present, nothing stale — costs one query rather than two.
  if (live.length !== rows.length) {
    await prisma.documentCollabPresence.deleteMany({
      where: { documentId, updatedAt: { lt: new Date(now.getTime() - PRESENCE_TTL_MS) } },
    });
  }

  return live;
}
