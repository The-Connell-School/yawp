import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { MAX_PRESENCE_BYTES } from '~/domain/collaboration/presence';
import {
  presenceIdentityFor,
  publishPresence,
} from '~/domain/collaboration/presence.server';
import { requireCollabRoomAccess } from '~/domain/collaboration/room-access.server';

/**
 * Where one writer's caret is: `POST /api/collab/:id/presence`.
 *
 * Its own endpoint rather than a field on the update POST, because the two do
 * opposite things. A document update is appended to the room's permanent log
 * and triggers the snapshot dual-write that grading, search and submission
 * read; a cursor position must reach neither. Keeping them apart means a caret
 * moving several times a second can never turn into log rows or snapshot
 * writes, however the client behaves.
 *
 * Reading presence is not here — it rides along on the update GET, which polls
 * the same draft on the same cadence and would otherwise be asked twice.
 *
 * Author scope, so a teacher following a draft reads carets but never publishes
 * one. They comment on student writing; they do not stand in it.
 *
 * The body is `{ awareness: base64 }` — one encoded Yjs awareness update
 * carrying this client's own state. A `null` state inside it is a tab closing,
 * which clears the caret at once instead of leaving it to the TTL.
 */
export async function action({ request, params }: ActionFunctionArgs) {
  const documentId = params.id;
  const access = await requireCollabRoomAccess(request, documentId, 'author');

  if (!access.ok) {
    return dataResponse(
      { success: false, message: 'Not available.' },
      { status: access.reason === 'missing-document' ? 400 : 403 }
    );
  }

  let body: { awareness?: unknown };
  try {
    body = await request.json();
  } catch {
    return dataResponse(
      { success: false, message: 'Malformed payload.' },
      { status: 400 }
    );
  }

  if (typeof body.awareness !== 'string' || body.awareness.length === 0) {
    return dataResponse(
      { success: false, message: 'No presence supplied.' },
      { status: 400 }
    );
  }

  const bytes = Buffer.from(body.awareness, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PRESENCE_BYTES) {
    return dataResponse(
      { success: false, message: 'Presence is empty or too large.' },
      { status: 413 }
    );
  }

  // The identity a caret will be labelled with, resolved from the group rather
  // than read out of the payload. A member who has since been removed from the
  // group has no identity here and so no caret — the same answer a teacher gets.
  const identity = await presenceIdentityFor({
    documentId: documentId!,
    membershipId: access.profileId,
  });

  if (!identity) {
    return dataResponse(
      { success: false, message: 'Not a writer on this draft.' },
      { status: 403 }
    );
  }

  const result = await publishPresence({
    documentId: documentId!,
    membershipId: access.profileId,
    identity,
    update: new Uint8Array(bytes),
  });

  if (result.status === 'rejected') {
    return dataResponse(
      { success: false, message: 'Malformed presence.' },
      { status: result.reason === 'too-many-clients' ? 413 : 400 }
    );
  }

  return dataResponse({ success: true });
}
