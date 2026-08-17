import { prisma } from '~/utils/db.server';
import { decideSeed, type SeedDecision } from './seed';

/**
 * Seeding a collaboration room from the document's existing HTML.
 *
 * The room is reached through an injectable client. With the transport now
 * self-hosted, the only implementation is `localRoomClient` in
 * `room-store.server.ts`, which reads and writes our own update log — so this is
 * ordinary testable code rather than the unverified provider HTTP it replaced.
 * The seam stays because it is also what lets the tests drive it.
 */

export type CollabRoomClient = {
  /** Encoded Yjs state for a room, or null if the room holds nothing yet. */
  getState: (documentName: string) => Promise<Uint8Array | null>;
  /** Applies an encoded Yjs update to a room. */
  putState: (documentName: string, update: Uint8Array) => Promise<void>;
};

export class SeedError extends Error {}

export type SeedGroupResult =
  | { status: 'seeded' }
  | { status: 'skipped'; reason: SeedDecision extends { seed: false } ? never : string };

/**
 * Seeds a group's room from its document's HTML, at most once.
 *
 * Ordering is the whole design. The room's own state is read first and is the
 * authority: if a student has already typed, or a previous seed landed and we lost
 * the acknowledgement, the room is not empty and nothing is written. `seededAt` is
 * stamped only after the provider has accepted the update, so a failure part-way
 * leaves the group eligible to try again rather than permanently marked done.
 *
 * The reverse order — stamp, then write — would turn one dropped response into a
 * group whose draft silently starts empty.
 */
export async function seedGroupRoomIfEmpty({
  groupId,
  client,
}: {
  groupId: string;
  /** Required: the caller chooses the store, so there is no hidden default. */
  client: CollabRoomClient;
}): Promise<SeedGroupResult> {
  const group = await prisma.documentGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      seededAt: true,
      documentId: true,
      document: { select: { html: true } },
    },
  });

  if (!group) throw new SeedError('Group not found.');
  if (!group.documentId || !group.document) {
    return { status: 'skipped', reason: 'no-document' as never };
  }
  if (group.seededAt) {
    return { status: 'skipped', reason: 'already-seeded' as never };
  }

  const roomState = await client.getState(group.documentId);

  const decision = decideSeed({
    html: group.document.html,
    seededAt: group.seededAt,
    roomState,
  });

  if (!decision.seed) {
    // A room that already has content still gets marked, so we stop re-reading it
    // on every open. "Nothing to seed" does not: an empty draft may gain content
    // later and become worth seeding.
    if (decision.reason === 'room-not-empty') {
      await prisma.documentGroup.update({
        where: { id: group.id },
        data: { seededAt: new Date() },
      });
    }
    return { status: 'skipped', reason: decision.reason as never };
  }

  await client.putState(group.documentId, decision.update);

  // Only now, once the provider has accepted it.
  await prisma.documentGroup.update({
    where: { id: group.id },
    data: { seededAt: new Date() },
  });

  return { status: 'seeded' };
}
