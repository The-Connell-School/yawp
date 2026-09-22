import { data as dataResponse, type ActionFunctionArgs, type LoaderFunctionArgs } from 'react-router';
import * as Y from 'yjs';
import { applyCollabSnapshot } from '~/domain/collaboration/dual-write.server';
import { readPresence } from '~/domain/collaboration/presence.server';
import { requireCollabRoomAccess } from '~/domain/collaboration/room-access.server';
import {
  appendUpdate,
  compactRoomIfNeeded,
  readRoomState,
  readUpdatesSince,
} from '~/domain/collaboration/room-store.server';
import { yUpdateToSnapshot } from '~/domain/collaboration/snapshot';

/**
 * The collaboration transport, self-hosted.
 *
 * `GET`  — everything after the caller's cursor, so a client can catch up or
 *          poll, plus who is currently in the room and where their carets are.
 * `POST` — one batch of the caller's own Yjs updates.
 *
 * This is what replaces a hosted provider. It works because Yjs updates are
 * commutative and idempotent: a client that polls a second late, or receives the
 * same update twice, converges on the same document anyway. So there is no session,
 * no socket and no ordering guarantee to maintain — just a log and a cursor.
 *
 * Authorization is the ordinary session cookie plus the existing document scopes,
 * which is the other simplification over a provider: no signed token has to be
 * handed to anyone.
 *
 * - reading requires read scope, so a teacher can follow a draft live
 * - writing requires author scope, which excludes teachers by design: they comment
 *   on student work, they do not type in it
 *
 * Presence rides along on the GET rather than getting a poll of its own. Carets
 * and text are wanted on exactly the same cadence and about exactly the same
 * draft, so a second timer would double the request count to learn things this
 * one already had to ask for. Publishing a caret is a separate endpoint, and
 * that asymmetry is deliberate: a cursor move must never enter the update log
 * or trigger the snapshot dual-write, which is what a POST here does.
 */

/** Guards against a single request carrying an implausible amount of state. */
const MAX_UPDATE_BYTES = 512 * 1024;
const MAX_UPDATES_PER_REQUEST = 64;

export async function loader({ request, params }: LoaderFunctionArgs) {
  const documentId = params.id;
  const access = await requireCollabRoomAccess(request, documentId, 'read');

  if (!access.ok) {
    return dataResponse(
      { success: false, message: 'Not available.' },
      { status: access.reason === 'missing-document' ? 400 : 403 }
    );
  }

  const url = new URL(request.url);
  const rawSince = Number(url.searchParams.get('since') ?? '0');
  // A malformed cursor replays the room rather than skipping it. Yjs makes that
  // harmless, whereas trusting a bad number could silently drop content.
  const sinceSeq = Number.isFinite(rawSince) && rawSince > 0 ? Math.floor(rawSince) : 0;

  const [{ updates, cursor, hasMore }, presence] = await Promise.all([
    readUpdatesSince({ documentId: documentId!, sinceSeq }),
    readPresence({ documentId: documentId! }),
  ]);

  return dataResponse({
    success: true,
    cursor,
    hasMore,
    updates: updates.map((update) => Buffer.from(update).toString('base64')),
    // The whole live set every time, not a delta. Awareness states carry their
    // own clock, so re-applying one a client already has is a no-op — the same
    // property that lets the document updates above be replayed safely. It also
    // means the list doubles as the answer to "who left": a client the caller is
    // still showing and this set does not name has gone.
    presence: presence.map((entry) => ({
      clientId: entry.clientId,
      state: Buffer.from(entry.state).toString('base64'),
    })),
  });
}

export async function action({ request, params }: ActionFunctionArgs) {
  const documentId = params.id;
  // Author scope: the owner or an active co-author. A teacher reading the draft
  // gets a 403 here even though the GET above succeeds for them.
  const access = await requireCollabRoomAccess(request, documentId, 'author');

  if (!access.ok) {
    return dataResponse(
      {
        success: false,
        message:
          access.reason === 'out-of-scope'
            ? 'You can read this draft but not write in it.'
            : 'Not available.',
      },
      { status: access.reason === 'missing-document' ? 400 : 403 }
    );
  }

  let body: { updates?: unknown };
  try {
    body = await request.json();
  } catch {
    return dataResponse(
      { success: false, message: 'Malformed payload.' },
      { status: 400 }
    );
  }

  if (!Array.isArray(body.updates) || body.updates.length === 0) {
    return dataResponse(
      { success: false, message: 'No updates supplied.' },
      { status: 400 }
    );
  }
  if (body.updates.length > MAX_UPDATES_PER_REQUEST) {
    return dataResponse(
      { success: false, message: 'Too many updates in one request.' },
      { status: 413 }
    );
  }

  const decoded: Uint8Array[] = [];
  for (const entry of body.updates) {
    if (typeof entry !== 'string') {
      return dataResponse(
        { success: false, message: 'Malformed update.' },
        { status: 400 }
      );
    }
    const bytes = Buffer.from(entry, 'base64');
    if (bytes.length === 0 || bytes.length > MAX_UPDATE_BYTES) {
      return dataResponse(
        { success: false, message: 'Update is empty or too large.' },
        { status: 413 }
      );
    }

    // Prove it decodes before it is allowed into the log. Without this, one
    // malformed update from a buggy or hostile client is appended and then every
    // subsequent read of the room throws while merging it — the room is bricked
    // permanently, and the students in it lose access to their own draft.
    const update = new Uint8Array(bytes);
    const probe = new Y.Doc();
    try {
      Y.applyUpdate(probe, update);
    } catch {
      return dataResponse(
        { success: false, message: 'Malformed update.' },
        { status: 400 }
      );
    } finally {
      probe.destroy();
    }

    decoded.push(update);
  }

  let cursor = 0;
  for (const update of decoded) {
    const { seq } = await appendUpdate({
      documentId: documentId!,
      update,
      membershipId: access.profileId,
    });
    cursor = seq;
  }

  // Dual-write the derived snapshot so grading, the tutor, search, comments,
  // revision history and submission keep seeing the document. Derived from the
  // whole room rather than the incoming batch, because a snapshot of one keystroke
  // is not a document.
  //
  // Attributed to the caller: this write is caused by their edits, and
  // DocumentWriteJournal is where a contribution breakdown will read from.
  const state = await readRoomState({ documentId: documentId! });
  if (state) {
    await applyCollabSnapshot({
      documentId: documentId!,
      snapshot: yUpdateToSnapshot(state),
      source: 'collab-http',
      membershipId: access.profileId,
    });
  }

  // Keep the log short enough that reading it stays cheap. Cheap to check and a
  // no-op almost every time.
  await compactRoomIfNeeded({ documentId: documentId! });

  return dataResponse({ success: true, cursor });
}
