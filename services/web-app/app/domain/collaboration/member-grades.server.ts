import { prisma } from '~/utils/db.server';

/**
 * The individual half of two-tier grading: one grade per student on a shared
 * draft, beside the group's own grade.
 *
 * Set by a teacher, never computed. The contribution panel gives them character
 * counts, shares and session times to read, but every automatic contribution
 * metric fails on ordinary group-work patterns — the student who types while the
 * group talks takes most of the share, and the one who writes the load-bearing
 * sentence takes almost none. The evidence informs the number; it never becomes
 * the number.
 *
 * Keyed to the group rather than a Submission because submitting a group draft
 * is not wired yet, so a Submission-keyed grade could not be entered at all.
 */

export class MemberGradeError extends Error {}

/** Long enough for "meets expectations", short enough that it is not feedback. */
const MAX_SCORE_LENGTH = 64;

const trimmedOrNull = (value?: string | null) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function recordMemberGrade({
  groupId,
  membershipId,
  gradedByMembershipId,
  score,
  feedback,
  release,
  now = new Date(),
}: {
  groupId: string;
  membershipId: string;
  gradedByMembershipId: string;
  score?: string | null;
  feedback?: string | null;
  /** True to show the student, false to take it back, undefined to leave as-is. */
  release?: boolean;
  now?: Date;
}) {
  const cleanScore = trimmedOrNull(score);
  if (cleanScore && cleanScore.length > MAX_SCORE_LENGTH) {
    throw new MemberGradeError(
      `A score can be at most ${MAX_SCORE_LENGTH} characters. Put the detail in the comment.`
    );
  }

  const group = await prisma.documentGroup.findFirst({
    where: { id: groupId },
    select: {
      id: true,
      members: {
        where: { removedAt: null },
        select: { membershipId: true },
      },
    },
  });

  if (!group) throw new MemberGradeError('That group no longer exists.');

  // The membership id arrives from a form, so being on the page is not proof it
  // names someone in this group.
  const inGroup = group.members.some(
    (member) => member.membershipId === membershipId
  );
  if (!inGroup) {
    throw new MemberGradeError('That student is not in this group.');
  }

  const releasedAt =
    release === undefined ? undefined : release ? now : null;
  const cleanFeedback = trimmedOrNull(feedback);

  await prisma.documentGroupMemberGrade.upsert({
    where: { groupId_membershipId: { groupId, membershipId } },
    create: {
      groupId,
      membershipId,
      gradedByMembershipId,
      score: cleanScore,
      feedback: cleanFeedback,
      // Unreleased by default: nothing reaches a student while the teacher is
      // still working through the group.
      releasedAt: releasedAt ?? null,
    },
    update: {
      gradedByMembershipId,
      score: cleanScore,
      feedback: cleanFeedback,
      ...(release === undefined ? {} : { releasedAt }),
    },
  });

  return { saved: true as const };
}

export type MemberGrade = {
  score: string | null;
  feedback: string | null;
  releasedAt: string | null;
};

export async function readMemberGrades({
  groupId,
}: {
  groupId: string;
}): Promise<Map<string, MemberGrade>> {
  const rows = await prisma.documentGroupMemberGrade.findMany({
    where: { groupId },
    select: {
      membershipId: true,
      score: true,
      feedback: true,
      releasedAt: true,
    },
  });

  return new Map(
    rows.map((row) => [
      row.membershipId,
      {
        score: row.score,
        feedback: row.feedback,
        releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
      },
    ])
  );
}
