import { prisma } from '~/utils/db.server';

/**
 * The group half of two-tier grading.
 *
 * One grade for the draft as a piece of writing, shared by everyone in the
 * group. It lives on the group's `Submission` — the same row and the same
 * columns a solo essay's grade uses, because it is the same kind of judgement
 * about the same kind of artefact.
 *
 * The individual half is `member-grades.server`. The two meet in
 * `effectiveGrade`, which derives what each student actually has rather than
 * copying the group grade onto their row — so re-grading the group moves every
 * follower at once and leaves deliberate overrides alone.
 */

export class GroupGradeError extends Error {}

export type GroupGrade = {
  submissionId: string;
  score: string | null;
  feedback: string | null;
  submittedAt: string;
  releasedAt: string | null;
};

/** The group's live submission, or null if they have not submitted. */
export async function readGroupGrade({
  documentId,
}: {
  documentId: string;
}): Promise<GroupGrade | null> {
  const submission = await prisma.submission.findFirst({
    // An unsubmitted submission is one a teacher withdrew; it is not the group's
    // current work.
    where: { documentId, unsubmittedAt: null },
    orderBy: { submittedAt: 'desc' },
    select: {
      id: true,
      score: true,
      feedback: true,
      submittedAt: true,
      releasedAt: true,
    },
  });

  if (!submission) return null;

  return {
    submissionId: submission.id,
    score: submission.score,
    feedback: submission.feedback,
    submittedAt: submission.submittedAt.toISOString(),
    releasedAt: submission.releasedAt ? submission.releasedAt.toISOString() : null,
  };
}

export async function recordGroupGrade({
  documentId,
  gradedByMembershipId,
  score,
  feedback,
  release,
  now = new Date(),
}: {
  documentId: string;
  gradedByMembershipId: string;
  score?: string | null;
  feedback?: string | null;
  release?: boolean;
  now?: Date;
}) {
  const submission = await prisma.submission.findFirst({
    where: { documentId, unsubmittedAt: null },
    orderBy: { submittedAt: 'desc' },
    select: { id: true },
  });

  if (!submission) {
    // Grading work the group has not submitted would grade a moving target.
    throw new GroupGradeError(
      'This group has not submitted their draft yet, so there is nothing to grade.'
    );
  }

  const trimmed = (value?: string | null) => {
    const next = value?.trim();
    return next ? next : null;
  };

  await prisma.submission.update({
    where: { id: submission.id },
    data: {
      score: trimmed(score),
      feedback: trimmed(feedback),
      gradedByMembershipId,
      gradedAt: now,
      ...(release === undefined ? {} : { releasedAt: release ? now : null }),
    },
  });

  return { saved: true as const };
}

/**
 * What one student's grade actually is.
 *
 * Derivation rather than storage is the whole point: a student who follows the
 * group has no number of their own, so changing the group's grade changes theirs
 * with no rows to update and nothing to fall out of step.
 */
export function effectiveGrade({
  member,
  groupGrade,
}: {
  member?: { followsGroupGrade: boolean; score: string | null };
  groupGrade: { score: string | null } | null;
}): { score: string | null; source: 'group' | 'individual' | 'none' } {
  if (member && !member.followsGroupGrade && member.score) {
    return { score: member.score, source: 'individual' };
  }
  if (groupGrade?.score) {
    return { score: groupGrade.score, source: 'group' };
  }
  return { score: null, source: 'none' };
}
