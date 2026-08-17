import { prisma } from '~/utils/db.server';
import { decideSeed, type SeedDecision } from './seed';

/**
 * Seeding a collaboration room from the document's existing HTML.
 *
 * The provider is reached through a small injectable client so the orchestration —
 * the guards, the ordering, the failure handling — is testable without a network,
 * and only the HTTP transport itself is unverified.
 */

export type CollabRoomClient = {
  /** Encoded Yjs state for a room, or null if the room does not exist yet. */
  getState: (documentName: string) => Promise<Uint8Array | null>;
  /** Applies an encoded Yjs update to a room. */
  putState: (documentName: string, update: Uint8Array) => Promise<void>;
};

export class SeedError extends Error {}

/**
 * The real provider client.
 *
 * ⚠️ UNVERIFIED TRANSPORT. The paths and the `format=yjs` parameter follow Tiptap
 * Collaboration's documented REST shape but have not been exercised against a live
 * app. If seeding misbehaves, check this first — the orchestration below is
 * covered by tests, this function is not.
 */
export function providerRoomClient({
  appId = process.env.TIPTAP_COLLAB_APP_ID,
  secret = process.env.TIPTAP_COLLAB_SECRET,
}: { appId?: string; secret?: string } = {}): CollabRoomClient {
  if (!appId || !secret) {
    throw new SeedError('Collaboration is not configured on this server.');
  }

  const base = `https://${appId}.collab.tiptap.cloud/api/documents`;
  const headers = { Authorization: secret };

  return {
    async getState(documentName) {
      const response = await fetch(
        `${base}/${encodeURIComponent(documentName)}?format=yjs`,
        { headers }
      );
      // A room that has never been opened does not exist yet, which is the
      // emptiest a room can be.
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new SeedError(
          `Could not read the collaboration room (${response.status}).`
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    },

    async putState(documentName, update) {
      const response = await fetch(
        `${base}/${encodeURIComponent(documentName)}?format=yjs`,
        {
          method: 'PATCH',
          headers: { ...headers, 'content-type': 'application/octet-stream' },
          body: update as unknown as BodyInit,
        }
      );
      if (!response.ok) {
        throw new SeedError(
          `Could not seed the collaboration room (${response.status}).`
        );
      }
    },
  };
}

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
  client?: CollabRoomClient;
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

  const rooms = client ?? providerRoomClient();
  const roomState = await rooms.getState(group.documentId);

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

  await rooms.putState(group.documentId, decision.update);

  // Only now, once the provider has accepted it.
  await prisma.documentGroup.update({
    where: { id: group.id },
    data: { seededAt: new Date() },
  });

  return { status: 'seeded' };
}
