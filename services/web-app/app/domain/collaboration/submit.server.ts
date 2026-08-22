import { createHash } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { isDocumentSubmittableContent } from '~/utils/document-submittable';
import { readRoomState } from './room-store.server';
import { yUpdateToSnapshot } from './snapshot';
import {
  summarizeGroupSubmitReadiness,
  type GroupSubmitReadiness,
} from './submit-readiness';

/**
 * Submitting a shared draft.
 *
 * Separate from `api.domain.submit-document` on purpose, like everything else in
 * this feature. That route scopes to the document's owner or a teacher, so a
 * co-author who is not the nominal owner cannot use it at all — and threading a
 * group case through it would put collaborative and solo submission in one path
 * where a mistake reaches every student.
 *
 * Three properties matter more here than in the solo case:
 *
 * - **Every member has to press.** Submitting ends everybody's chance to change
 *   the draft, so the first press must not be able to do that to the rest of the
 *   group: a press marks one member, and the press that completes the set is the
 *   one that creates the `Submission`. Before that, nothing reaches the teacher.
 *   The one exception is the teacher, who may submit for a group that is stuck on
 *   a member who never presses — the rule needs a way out, and nobody inside the
 *   group has one. It is recorded rather than silent: the submission says which
 *   teacher did it, and the group's page tells them so.
 * - **A press is reversible until then.** A student who pressed too early can
 *   take it back while the group is still waiting on someone, which is the only
 *   way out that does not involve a teacher.
 * - **Submitting twice must be harmless.** With several people able to complete
 *   the set, two presses landing together is ordinary rather than exotic, and two
 *   submissions for one draft would be graded twice.
 */

export class GroupSubmitError extends Error {}

export type GroupSubmitStatus =
  /** This press completed the set; the draft is now with the teacher. */
  | 'submitted'
  /** Recorded, but the group is still waiting on somebody. */
  | 'waiting'
  /** The group had already submitted before this press. */
  | 'already-submitted';

export type GroupSubmitResult = {
  status: GroupSubmitStatus;
  submissionId: string | null;
  /** When the group's submission was made; null while the draft is still theirs. */
  submittedAt: string | null;
  /** True only when this call created the submission. */
  created: boolean;
  readiness: GroupSubmitReadiness;
};

const hashString = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const memberSelect = {
  where: { removedAt: null },
  orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  select: {
    membershipId: true,
    submittedAt: true,
    membership: { select: { user: { select: { name: true } } } },
  },
};

type LoadedGroup = {
  id: string;
  members: {
    membershipId: string;
    submittedAt: Date | null;
    membership: { user: { name: string | null } };
  }[];
};

function readinessOf(
  group: LoadedGroup | null,
  viewerMembershipId: string | null
): GroupSubmitReadiness {
  return summarizeGroupSubmitReadiness({
    members: (group?.members ?? []).map((member) => ({
      membershipId: member.membershipId,
      name: member.membership.user.name,
      submittedAt: member.submittedAt,
    })),
    viewerMembershipId,
  });
}

async function loadGroup(documentId: string): Promise<LoadedGroup | null> {
  return prisma.documentGroup.findFirst({
    where: { documentId },
    select: { id: true, members: memberSelect },
  });
}

/**
 * What the page shows: who has pressed, and whether the draft is already in.
 *
 * The same summary the action returns, so a student watching their group press
 * one by one reads exactly what the server would decide on.
 */
export async function readGroupSubmitState({
  documentId,
  viewerMembershipId,
}: {
  documentId: string;
  viewerMembershipId: string | null;
}): Promise<{
  readiness: GroupSubmitReadiness;
  submittedAt: string | null;
  submissionId: string | null;
  submittedByTeacherName: string | null;
}> {
  const [group, submission] = await Promise.all([
    loadGroup(documentId),
    prisma.submission.findFirst({
      where: { documentId, unsubmittedAt: null },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        submittedAt: true,
        submittedByTeacher: { select: { user: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    readiness: readinessOf(group, viewerMembershipId),
    submittedAt: submission?.submittedAt?.toISOString() ?? null,
    submissionId: submission?.id ?? null,
    // Named, not just flagged: "your teacher submitted this" is a different
    // sentence from "Ms Okonkwo submitted this for your group", and the second
    // is the one a student can act on.
    submittedByTeacherName:
      submission?.submittedByTeacher?.user.name?.trim() || null,
  };
}

/**
 * The active submission for each of several drafts, in one query.
 *
 * The groups board shows a whole class at once. Asking `readGroupSubmitState`
 * per group would be two queries a card, and a class of ten groups would pay
 * twenty round trips for a line of text.
 */
export async function readGroupSubmissions({
  documentIds,
}: {
  documentIds: string[];
}): Promise<
  Map<string, { submittedAt: string; submittedByTeacherName: string | null }>
> {
  if (documentIds.length === 0) return new Map();

  const submissions = await prisma.submission.findMany({
    where: { documentId: { in: documentIds }, unsubmittedAt: null },
    // Newest first, so the first row seen for a document is the one that counts
    // if a withdrawn-and-resubmitted draft ever has more than one.
    orderBy: { submittedAt: 'desc' },
    select: {
      documentId: true,
      submittedAt: true,
      submittedByTeacher: { select: { user: { select: { name: true } } } },
    },
  });

  const byDocument = new Map<
    string,
    { submittedAt: string; submittedByTeacherName: string | null }
  >();
  for (const submission of submissions) {
    if (!submission.documentId) continue;
    if (byDocument.has(submission.documentId)) continue;
    byDocument.set(submission.documentId, {
      submittedAt: submission.submittedAt.toISOString(),
      submittedByTeacherName:
        submission.submittedByTeacher?.user.name?.trim() || null,
    });
  }
  return byDocument;
}

/**
 * Takes back one member's press while the group is still waiting on someone.
 *
 * Only before the draft is in: once every member has pressed, the submission
 * exists and withdrawing it is a teacher's decision, not a classmate's.
 */
export async function withdrawGroupSubmit({
  documentId,
  membershipId,
}: {
  documentId: string;
  membershipId: string;
}): Promise<{ readiness: GroupSubmitReadiness }> {
  const existing = await prisma.submission.findFirst({
    where: { documentId, unsubmittedAt: null },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });
  if (existing) {
    throw new GroupSubmitError(
      'Your group has already submitted this draft. Ask your teacher to unsubmit it.'
    );
  }

  await prisma.documentGroupMember.updateMany({
    where: {
      group: { is: { documentId } },
      membershipId,
      removedAt: null,
    },
    data: { submittedAt: null },
  });

  return { readiness: readinessOf(await loadGroup(documentId), membershipId) };
}

export async function submitGroupDraft({
  document,
  userId,
  membershipId,
  submittedByTeacherMembershipId = null,
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
  /**
   * Set when a teacher is submitting for the group rather than a member
   * pressing. Skips the every-member requirement — that is the whole point of
   * the override — and is written onto the submission so the group is told.
   */
  submittedByTeacherMembershipId?: string | null;
  now?: Date;
}): Promise<GroupSubmitResult> {
  // An existing submission wins. Checked before anything is written so a second
  // press is a read rather than a race.
  const existing = await prisma.submission.findFirst({
    where: { documentId: document.id, unsubmittedAt: null },
    orderBy: { submittedAt: 'desc' },
    select: { id: true, submittedAt: true },
  });
  if (existing) {
    const group = await loadGroup(document.id);
    return {
      status: 'already-submitted',
      submissionId: existing.id,
      submittedAt: existing.submittedAt?.toISOString() ?? null,
      created: false,
      readiness: readinessOf(group, membershipId),
    };
  }

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

  // Checked on every press, not only the last one: a student pressing on an
  // empty draft should hear about it there and then, rather than the group
  // finding out from whoever happens to press last.
  if (!isDocumentSubmittableContent(html, text)) {
    throw new GroupSubmitError('Cannot submit an empty draft.');
  }

  const byTeacher = Boolean(submittedByTeacherMembershipId);

  // Record this member's press. Filtered through the group's relation rather
  // than a looked-up id so the press is one statement, and `submittedAt: null`
  // keeps a second press from moving the timestamp: the roster should show when
  // someone committed, not when they last clicked.
  //
  // Not for a teacher: the marks are the students' agreement, and recording an
  // override as a press would misreport who agreed to hand this in.
  if (!byTeacher) {
    await prisma.documentGroupMember.updateMany({
      where: {
        group: { is: { documentId: document.id } },
        membershipId,
        removedAt: null,
        submittedAt: null,
      },
      data: { submittedAt: now },
    });
  }

  const readiness = readinessOf(await loadGroup(document.id), membershipId);

  // Still someone to hear from. Nothing is written beyond this member's mark, so
  // the teacher sees no submission and the group keeps writing.
  if (!byTeacher && !readiness.everyoneSubmitted) {
    return {
      status: 'waiting',
      submissionId: null,
      submittedAt: null,
      created: false,
      readiness,
    };
  }

  const journal = await prisma.documentWriteJournal.create({
    data: {
      eventType: 'document.submit',
      source: byTeacher ? 'collab-submit-teacher' : 'collab-submit',
      status: 'pending',
      userId,
      // Whoever completed the set; the marks on the group say who else agreed.
      membershipId,
      documentId: document.id,
      title: document.title,
      html,
      text,
      htmlHash: hashString(html),
      textHash: hashString(text),
      baseRevision: document.revision,
      metadata: {
        source: 'collab',
        submittedAt: now.toISOString(),
        // Who had agreed at the moment this was written. On a member's press
        // that is the whole group; on a teacher's override it is however far the
        // group had got, which is the part worth keeping.
        submittedByMembershipIds: readiness.members
          .filter((member) => member.submitted)
          .map((member) => member.membershipId),
        submittedByTeacherMembershipId,
      },
    },
  });

  try {
    const submission = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction. Two members can complete the set within
      // milliseconds of each other — each one's mark makes the other look like
      // the last press — and two submissions for one draft would be graded
      // twice.
      const raced = await tx.submission.findFirst({
        where: { documentId: document.id, unsubmittedAt: null },
        orderBy: { submittedAt: 'desc' },
        select: { id: true, submittedAt: true },
      });
      if (raced) {
        return {
          id: raced.id,
          created: false,
          submittedAt: raced.submittedAt?.toISOString() ?? null,
        };
      }

      const created = await tx.submission.create({
        data: {
          documentId: document.id,
          title: document.title ?? '',
          html,
          text,
          submittedAt: now,
          submittedByTeacherMembershipId,
        },
        select: { id: true },
      });

      await tx.document.update({
        where: { id: document.id },
        data: { updatedAt: now },
      });

      // The marks describe the round in progress, and this round is over. Clear
      // them so that if a teacher unsubmits, the group has to agree again rather
      // than the draft going back in on presses from before the teacher's
      // intervention.
      await tx.documentGroupMember.updateMany({
        where: { group: { is: { documentId: document.id } } },
        data: { submittedAt: null },
      });

      return { id: created.id, created: true, submittedAt: now.toISOString() };
    });

    await prisma.documentWriteJournal.update({
      where: { id: journal.id },
      data: submission.created
        ? { status: 'accepted', resultingRevision: document.revision }
        : { status: 'rejected', failureReason: 'collab_submit_already_exists' },
    });

    return {
      status: submission.created ? 'submitted' : 'already-submitted',
      submissionId: submission.id,
      submittedAt: submission.submittedAt,
      created: submission.created,
      readiness,
    };
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
