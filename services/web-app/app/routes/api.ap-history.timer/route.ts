import { data as dataResponse, type ActionFunctionArgs } from 'react-router';
import { isApHistorySnapshot, parseApHistorySnapshot } from '~/domain/ap-history/schema';
import {
  requireMembership,
  requireMutableRequest,
  requireUserId,
} from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

function failure(message: string, status: number) {
  return dataResponse({ success: false, message }, { status });
}

export async function action({ request }: ActionFunctionArgs) {
  await requireMutableRequest(request);
  const userId = await requireUserId(request);
  const profile = await requireMembership(request, userId);

  if (profile.role !== 'STUDENT') {
    return failure('Only students can start an assignment timer.', 403);
  }

  const form = await request.formData();
  const documentId = form.get('documentId');
  if (typeof documentId !== 'string' || !documentId.trim()) {
    return failure('Document is required.', 400);
  }

  const document = await prisma.document.findFirst({
    where: {
      id: documentId.trim(),
      membershipId: profile.id,
      deletedAt: null,
    },
    select: {
      id: true,
      apHistoryTimerStartedAt: true,
      assignment: { select: { apHistorySnapshot: true } },
    },
  });

  if (!document) {
    return failure('Timed AP History document not found.', 404);
  }

  const snapshotValue = document.assignment?.apHistorySnapshot;
  if (!isApHistorySnapshot(snapshotValue)) {
    return failure('Timed AP History document not found.', 404);
  }
  const snapshot = parseApHistorySnapshot(snapshotValue);
  if (snapshot.timing.mode !== 'timed') {
    return failure('This AP History assignment is not timed.', 400);
  }

  if (document.apHistoryTimerStartedAt) {
    return dataResponse({
      success: true,
      timerStartedAt: document.apHistoryTimerStartedAt.toISOString(),
    });
  }

  await prisma.document.updateMany({
    where: {
      id: document.id,
      membershipId: profile.id,
      apHistoryTimerStartedAt: null,
    },
    data: { apHistoryTimerStartedAt: new Date() },
  });

  const persisted = await prisma.document.findFirst({
    where: {
      id: document.id,
      membershipId: profile.id,
      deletedAt: null,
    },
    select: { id: true, apHistoryTimerStartedAt: true },
  });
  if (!persisted?.apHistoryTimerStartedAt) {
    return failure('Could not start the assignment timer.', 409);
  }

  return dataResponse({
    success: true,
    timerStartedAt: persisted.apHistoryTimerStartedAt.toISOString(),
  });
}
