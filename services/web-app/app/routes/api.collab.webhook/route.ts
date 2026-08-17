import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { applyCollabSnapshot } from '~/domain/collaboration/dual-write.server';
import {
  COLLAB_WEBHOOK_SIGNATURE_HEADER,
  parseCollabWebhookPayload,
  verifyCollabWebhookSignature,
} from '~/domain/collaboration/webhook.server';

/**
 * Receives collaboration-provider webhooks and dual-writes the derived snapshot
 * into `Document.html` / `Document.text`.
 *
 * This is the piece that keeps grading, the tutor, search, comments, revision
 * history and submission working for a collaborative draft — without it they all
 * read a permanently empty document.
 *
 * Unauthenticated by session on purpose: the caller is the provider, not a user.
 * The HMAC signature over the raw body is the entire authentication, which is why
 * it is checked before anything else touches the payload.
 */
export async function action({ request }: ActionFunctionArgs) {
  const secret = process.env.TIPTAP_COLLAB_SECRET;
  if (!secret) {
    return dataResponse(
      { success: false, message: 'Collaboration is not configured.' },
      { status: 500 }
    );
  }

  // The raw text, not a parsed body: the signature covers the exact bytes sent,
  // and re-serializing parsed JSON would not reproduce them.
  const rawBody = await request.text();

  const signatureValid = verifyCollabWebhookSignature({
    rawBody,
    signatureHeader: request.headers.get(COLLAB_WEBHOOK_SIGNATURE_HEADER),
    secret,
  });

  if (!signatureValid) {
    // Deliberately uninformative, and identical for a missing, malformed or
    // wrong signature.
    return dataResponse(
      { success: false, message: 'Invalid signature.' },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return dataResponse(
      { success: false, message: 'Malformed payload.' },
      { status: 400 }
    );
  }

  const parsed = parseCollabWebhookPayload(body);
  if (!parsed.ok) {
    return dataResponse(
      { success: false, message: parsed.reason },
      { status: 400 }
    );
  }

  const { documentName, snapshot, membershipId, eventName } = parsed.event;

  // Presence, connection and empty state events are acknowledged and ignored.
  // They are most of the traffic; treating them as errors would make the
  // provider retry them forever.
  if (!snapshot) {
    return dataResponse({ success: true, status: 'ignored', eventName });
  }

  const result = await applyCollabSnapshot({
    documentId: documentName,
    snapshot,
    membershipId,
    trigger: eventName === 'document.saved' ? 'periodic' : 'auto',
    requestId: request.headers.get('x-request-id'),
    metadata: { eventName },
  });

  // A 200 even when skipped: the provider should not retry a webhook for a
  // document that is not a collaborative draft, because retrying will not change
  // the answer.
  return dataResponse({ success: true, status: result.status });
}
