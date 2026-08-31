import { createHash } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import { readRoomState } from './room-store.server';
import { yUpdateToSnapshot } from './snapshot';

/**
 * Submitting a shared draft.
 *
 * Separate from `api.domain.submit-document` on purpose, like everything else in
 * this feature. That route scopes to the document's owner or a teacher, so a
 * co-author who is not the nominal owner cannot use it at all — and threading a
 * group case through it would put collaborative and solo submission in one path
 * where a mistake reaches every student.
 *
 * Two properties matter more here than in the solo case:
 *
 * - **Any member may submit**, which the caller enforces with `documentAuthorWhere`.
 * - **Submitting twice must be harmless.** With several people able to press the
 *   button, two presses landing together is ordinary rather than exotic, and two
 *   submissions for one draft would be graded twice.
 */

export class GroupSubmitError extends Error {}

const hashString = (value: string) =>
  createHash('sha256').update(value).digest('hex');

export async function submitGroupDraft({
  document,
  userId,
  membershipId,
  now = new Date(),
}: {
  document: {
    id: string;
    title: string | null;
    revision: number;
    html: string | null;
    text: string | null;
  };
  userId: string;
  membershipId: string;
  now?: Date;
}): Promise<{ submissionId: string; created: boolean }> {
  // An existing submission wins. Checked before anything is written so a second
  // press is a read rather than a race.
  const existing = await prisma.submission.findFirst({
    where: { documentId: document.id, unsubmittedAt: null },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });
  if (existing) return { submissionId: existing.id, created: false };

  // Read the room rather than trusting the dual-written snapshot. The dual-write
  // can trail the last keystroke, and submitting a version the group can see is
  // stale on screen is the one outcome nobody would forgive.
  let html = document.html ?? '';
  let text = document.text ?? '';
  const state = await readRoomState({ documentId: document.id });
  if (state) {
    try {
      const snapshot = yUpdateToSnapshot(state);
      html = snapshot.html;
      text = snapshot.text;
    } catch {
      // Better to refuse than to submit the stale snapshot silently: the group
      // would have no way to tell which version was graded.
      throw new GroupSubmitError(
        'This draft could not be read for submission. Reload and try again — nothing your group wrote is lost.'
      );
    }
  }

  if (!isDocumentSubmittableContent(html, text)) {
    throw new GroupSubmitError('Cannot submit an empty draft.');
  }

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.submit',
      source: 'collab-submit',
      status: 'pending',
      userId,
      // One student submits on behalf of the group; the record says which one.
      membershipId,
      documentId: document.id,
      title: document.title,
      html,
      text,
      htmlHash: hashString(html),
      textHash: hashString(text),
      baseRevision: document.revision,
      metadata: { source: 'collab', submittedAt: now.toISOString() },
    },
  });

  try {
    const submission = await prisma.$transaction(async (tx) => {
      const created = await tx.submission.create({
        data: {
          documentId: document.id,
          title: document.title ?? '',
          html,
          text,
          submittedAt: now,
        },
        select: { id: true },
      });

      await tx.document.update({
        where: { id: document.id },
        data: { updatedAt: now },
      });

      return created;
    });

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: { status: 'accepted', resultingRevision: document.revision },
    });

    return { submissionId: submission.id, created: true };
  } catch (error) {
    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: {
        status: 'rejected',
        failureReason:
          error instanceof Error ? error.message : 'collab_submit_failed',
      },
    });
    throw error;
  }
}
