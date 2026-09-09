import { getSchema } from '@tiptap/core';
import { generateJSON } from '@tiptap/html';
import { Node as PMNode } from '@tiptap/pm/model';
import { prosemirrorToYXmlFragment } from 'y-prosemirror';
import * as Y from 'yjs';
import {
  COLLAB_FRAGMENT_FIELD,
  collaborativeSchemaExtensions,
} from './schema';
import { yDocToSnapshot } from './snapshot';

/**
 * Seeding: turning a document's existing HTML into Yjs state so a room can start
 * with what the student already wrote.
 *
 * This is the inverse of `snapshot.ts`, and it exists for one reason: a document
 * that already has content is becoming a shared draft. A freshly provisioned group
 * document is empty and needs no seeding — the case that matters is the student who
 * wrote something alone and now wants classmates in it.
 *
 * Seeding must happen exactly once, server-side, into a room confirmed empty.
 * Doing it client-side inserts one copy per participant, which is how a shared
 * essay silently becomes three shared essays.
 *
 * Pure, so it can be round-tripped against the snapshot conversion in tests.
 */

const schema = getSchema(collaborativeSchemaExtensions);

/**
 * Encodes HTML as a Yjs state update over the ProseMirror fragment the editor
 * binds to.
 *
 * Empty or whitespace-only HTML produces `null` rather than an update for an
 * empty document: there is nothing to seed, and writing an empty update would
 * still stamp the room as seeded.
 */
export function htmlToYUpdate(html: string): Uint8Array | null {
  if (!html || html.trim() === '') return null;

  const json = generateJSON(html, collaborativeSchemaExtensions);
  const node = PMNode.fromJSON(schema, json);

  const ydoc = new Y.Doc();
  try {
    prosemirrorToYXmlFragment(node, ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD));
    if (ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD).length === 0) return null;

    // Symmetry with the read side: if what we would seed reads back as an empty
    // snapshot, there is nothing worth seeding. "<p></p>" parses to a real
    // paragraph node, so a structural size check does not catch it — asking the
    // same converter grading uses does, and keeps the two definitions of "empty"
    // from drifting apart.
    const { html: seededHtml, text: seededText } = yDocToSnapshot(ydoc);
    if (seededHtml === '' && seededText === '') return null;

    return Y.encodeStateAsUpdate(ydoc);
  } finally {
    ydoc.destroy();
  }
}

/**
 * Whether an encoded room state holds any document content.
 *
 * This is the check that makes seeding safe. The room is the authority, not our
 * database: if it already has content — because a student got there first, or a
 * previous seed succeeded and we lost the acknowledgement — seeding again would
 * duplicate it.
 */
export function isRoomEmpty(state: Uint8Array | null | undefined): boolean {
  if (!state || state.length === 0) return true;

  const ydoc = new Y.Doc();
  try {
    Y.applyUpdate(ydoc, state);
    return ydoc.getXmlFragment(COLLAB_FRAGMENT_FIELD).length === 0;
  } catch {
    // Undecodable state is not provably empty, so refuse to treat it as such.
    return false;
  } finally {
    ydoc.destroy();
  }
}

export type SeedDecision =
  | { seed: true; update: Uint8Array }
  | { seed: false; reason: 'already-seeded' | 'nothing-to-seed' | 'room-not-empty' };

/**
 * Decides whether to seed, given everything known at the moment of the attempt.
 *
 * Both guards are checked, and they are not redundant: `seededAt` is our durable
 * record, while room emptiness is the provider's truth. Trusting only the first
 * would duplicate content if a student typed before the seed landed; trusting only
 * the second would re-seed a room a student had legitimately emptied.
 */
export function decideSeed({
  html,
  seededAt,
  roomState,
}: {
  html: string | null | undefined;
  seededAt: Date | null;
  roomState: Uint8Array | null | undefined;
}): SeedDecision {
  if (seededAt) return { seed: false, reason: 'already-seeded' };

  const update = htmlToYUpdate(html ?? '');
  if (!update) return { seed: false, reason: 'nothing-to-seed' };

  if (!isRoomEmpty(roomState)) return { seed: false, reason: 'room-not-empty' };

  return { seed: true, update };
}
