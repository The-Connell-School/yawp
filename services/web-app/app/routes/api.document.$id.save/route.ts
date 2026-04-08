import { invariant } from '@epic-web/invariant';
import { type ActionFunctionArgs } from 'react-router';
import { requireProfile, requireUserId } from '~/utils/auth.server';
import { contentHash as computeContentHash } from '~/utils/content-hash';
import { prisma } from '~/utils/db.server';

const REVISION_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export const action = async ({ request, params }: ActionFunctionArgs) => {
  invariant(params.id, 'No document id provided');

  const userId = await requireUserId(request);
  const profile = await requireProfile(request, userId);

  const body = await request.json();
  const { html, text, contentHash, trigger, baseRevision } = body as {
    html: string;
    text: string;
    contentHash: string;
    trigger?: string;
    baseRevision?: number;
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
      baseRevision: baseRevision ?? null,
      html,
      text,
    },
  });

  // Concurrency check: if the client supplied a baseRevision, it must match the
  // current document revision. This prevents stale sync-service writes (e.g. from
  // a backgrounded tab or an editor whose in-memory state regressed) from
  // clobbering newer content. Clients that don't send baseRevision are still
  // accepted for backward compatibility with older deployed builds.
  if (typeof baseRevision === 'number' && baseRevision !== document.revision) {
    // Before declaring a real conflict, check whether the client's content
    // already matches what's on the server. This catches the very common
    // "metadata-only stale" case: e.g. the editor just successfully wrote
    // the same content via the PUT path, which advanced the server revision
    // but didn't update IndexedDB's serverRevision. The client's next
    // sync-service POST then carries a stale baseRevision but identical
    // content. Treat that as a no-op success so the client can advance its
    // watermark without ever surfacing a fake conflict to the student.
    const currentHash = await computeContentHash(
      document.html ?? '',
      document.text ?? ''
    );
    if (contentHash === currentHash) {
      await prisma.documentWriteJournal.update({
        where: { id: journal.id },
        data: {
          status: 'accepted',
          resultingRevision: document.revision,
          metadata: { noChange: true, reason: 'content_already_in_sync' },
        },
      });
      return new Response(
        JSON.stringify({
          ok: true,
          revision: document.revision,
          savedAt: document.updatedAt.toISOString(),
          noChange: true,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'rejected',
        failureReason: 'stale_base_revision',
      },
    });
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'stale_base_revision',
        currentRevision: document.revision,
      }),
      {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

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
        // Snapshot the NEW content we just wrote, not the pre-update doc state.
        // The previous code captured the stale `document.html`/`document.text`
        // read before the update, so revision history showed the wrong content.
        html,
        text,
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
