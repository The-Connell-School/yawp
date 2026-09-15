import { type ActionFunctionArgs, data as dataResponse } from 'react-router';
import { requireMembership, requireUserId } from '~/utils/auth.server.js';
import { prisma } from '~/utils/db.server.js';

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return dataResponse({ error: 'Method not allowed' }, { status: 405 });
  }

  const userId = await requireUserId(request);
  const membership = await requireMembership(request, userId);

  const body = await request.json().catch(() => null);
  const { documentId, textLength, content, eventId } = body ?? {};

  if (typeof documentId !== 'string' || !documentId || documentId.length > 200 ||
      !Number.isInteger(textLength) || textLength < 0 || textLength > 1_000_000 ||
      (content != null && (typeof content !== 'string' || content.length > 1_000_000)) ||
      (eventId != null && (typeof eventId !== 'string' || !/^paste_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(eventId)))) {
    return dataResponse({ error: 'Invalid request' }, { status: 400 });
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      membershipId: membership.id,
    },
  });

  if (!document) {
    return dataResponse({ error: 'Document not found' }, { status: 404 });
  }

  const event = { documentId, membershipId: membership.id, textLength, content: content || null };
  if (eventId) {
    // New clients keep a stable link in saved document HTML. The old table and
    // projection stay in use; duplicate delivery never creates a second event.
    await prisma.pasteAlert.createMany({ data: { ...event, id: eventId }, skipDuplicates: true });
    const saved = await prisma.pasteAlert.findUnique({
      where: { id: eventId }, select: { documentId: true, membershipId: true },
    });
    if (!saved || saved.documentId !== documentId || saved.membershipId !== membership.id) {
      return dataResponse({ error: 'Event identity unavailable' }, { status: 409 });
    }
  } else {
    await prisma.pasteAlert.create({ data: event });
  }

  return dataResponse({ success: true });
}
