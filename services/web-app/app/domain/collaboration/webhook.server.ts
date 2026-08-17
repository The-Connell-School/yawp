import { createHmac, timingSafeEqual } from 'node:crypto';
import { yUpdateToSnapshot, prosemirrorJsonToSnapshot } from './snapshot';
import type { DocumentSnapshot } from './snapshot';

/**
 * Verifying and parsing collaboration-provider webhooks.
 *
 * This endpoint is a write path into student work that is reachable from the
 * public internet, so the signature check is the only thing standing between a
 * stranger and overwriting a group's essay. Everything here is pure so it can be
 * tested directly.
 *
 * ⚠️ The header name and payload shape below follow Tiptap Collaboration's
 * documented conventions but have NOT been confirmed against a live app. Both are
 * the first things to check when wiring this up for real.
 */

/** Tiptap signs the raw body; some senders prefix the hex digest with `sha256=`. */
export const COLLAB_WEBHOOK_SIGNATURE_HEADER = 'x-hub-signature-256';

/**
 * Constant-time signature comparison.
 *
 * `timingSafeEqual` throws on length mismatch, so the lengths are compared first
 * — and a mismatch is simply a failure, which leaks nothing a caller could not
 * already determine from the digest length.
 */
export function verifyCollabWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
}: {
  rawBody: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!secret || !signatureHeader) return false;

  const provided = signatureHeader.trim().replace(/^sha256=/i, '');
  if (!/^[0-9a-f]+$/i.test(provided)) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  const providedBytes = Buffer.from(provided.toLowerCase(), 'hex');
  const expectedBytes = Buffer.from(expected, 'hex');
  if (providedBytes.length !== expectedBytes.length) return false;

  return timingSafeEqual(providedBytes, expectedBytes);
}

export type CollabWebhookEvent = {
  /** Room name, which is the Yawp document id. */
  documentName: string;
  snapshot: DocumentSnapshot | null;
  /** Membership that caused the change, when the provider reports it. */
  membershipId: string | null;
  eventName: string;
};

type ParseResult =
  | { ok: true; event: CollabWebhookEvent }
  | { ok: false; reason: string };

/**
 * Events that carry document state worth persisting. Presence and connection
 * events are ignored rather than treated as errors — they are the majority of
 * traffic and mean nothing changed.
 */
const STATE_EVENTS = new Set(['change', 'document.saved', 'create']);

/**
 * Extracts a snapshot from a webhook payload.
 *
 * Two payload shapes are accepted because the provider can be configured either
 * way, and because it decides which one arrives:
 *
 * - `state`: base64 Yjs update. Preferred — it is the actual CRDT state, and
 *   reconstructing it locally means the snapshot is derived by the same code path
 *   the tests exercise.
 * - `content`: ProseMirror JSON, converted with the shared schema.
 */
export function parseCollabWebhookPayload(body: unknown): ParseResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, reason: 'malformed-payload' };
  }

  const payload = body as Record<string, unknown>;
  const documentName =
    typeof payload.name === 'string'
      ? payload.name
      : typeof payload.documentName === 'string'
        ? payload.documentName
        : null;

  if (!documentName) return { ok: false, reason: 'missing-document-name' };

  const eventName =
    (typeof payload.event === 'string' && payload.event) ||
    (typeof payload.trigger === 'string' && payload.trigger) ||
    'change';

  const membershipId =
    typeof payload.userId === 'string'
      ? payload.userId
      : typeof payload.membershipId === 'string'
        ? payload.membershipId
        : null;

  if (!STATE_EVENTS.has(eventName)) {
    return {
      ok: true,
      event: { documentName, snapshot: null, membershipId, eventName },
    };
  }

  let snapshot: DocumentSnapshot | null = null;

  if (typeof payload.state === 'string' && payload.state.length > 0) {
    try {
      snapshot = yUpdateToSnapshot(
        new Uint8Array(Buffer.from(payload.state, 'base64'))
      );
    } catch {
      return { ok: false, reason: 'undecodable-state' };
    }
  } else if (payload.content && typeof payload.content === 'object') {
    try {
      snapshot = prosemirrorJsonToSnapshot(payload.content as any);
    } catch {
      return { ok: false, reason: 'undecodable-content' };
    }
  } else {
    // A state event with nothing in it. Not an error: the provider may notify
    // first and expect us to fetch. Nothing to write either way.
    return {
      ok: true,
      event: { documentName, snapshot: null, membershipId, eventName },
    };
  }

  return { ok: true, event: { documentName, snapshot, membershipId, eventName } };
}
