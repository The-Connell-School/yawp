import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { prisma } from '~/utils/db.server';

const REVISION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export const action = async ({ request, params }: ActionFunctionArgs) => {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const body = await request.json();
  const { html, text, contentHash, trigger } = body as {
    html: string;
    text: string;
    contentHash: string;
    trigger?: string;
  };

  const [user, document] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isAdmin: true },
    }),
    prisma.document.findUniqueOrThrow({
      where: { id: params.id },
      select: {
        id: true,
        profileId: true,
        html: true,
        text: true,
        revision: true,
        updatedAt: true,
      },
    }),
  ]);

  if (!user.isAdmin && document.profileId !== profile.id) {
    return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.save',
      source: 'sync-service',
      status: 'pending',
      userId,
      profileId: profile.id,
      documentId: document.id,
      htmlHash: contentHash,
      textHash: contentHash,
      html,
      text,
    },
  });

  const updated = await prisma.document.update({
    where: { id: document.id },
    data: {
      html,
      text,
      revision: { increment: 1 },
      updatedAt: new Date(),
    },
    select: { revision: true, updatedAt: true },
  });

  const resolvedTrigger = trigger ?? null;
  const lastRevision = await prisma.documentRevision.findFirst({
    where: { documentId: document.id },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });

  const now = new Date();
  const shouldCreateRevision =
    resolvedTrigger === 'session-start' ||
    resolvedTrigger === 'session-end' ||
    resolvedTrigger === 'submit' ||
    !lastRevision ||
    now.getTime() - lastRevision.createdAt.getTime() > REVISION_INTERVAL_MS;

  if (shouldCreateRevision) {
    await prisma.documentRevision.create({
      data: {
        documentId: document.id,
        html: document.html ?? '',
        text: document.text ?? '',
        trigger: resolvedTrigger ?? (!lastRevision ? 'session-start' : 'auto'),
      },
    });
  }

  await prisma.documentWriteJournal.update({
    where: { id: journal.id },
    data: {
      status: 'accepted',
      resultingRevision: updated.revision,
    },
  });

  return new Response(
    JSON.stringify({
      ok: true,
      revision: updated.revision,
      savedAt: updated.updatedAt.toISOString(),
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
