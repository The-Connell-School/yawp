import { prisma } from '~/utils/db.server';
import type { MemberGrade } from './grading';

export type { MemberGrade } from './grading';

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
 * Keyed to the group rather than a Submission so that grading works whether or
 * not the group has submitted.
 *
 * The group's grade is never copied onto member rows. Most students simply take
 * it — a teacher with thirty students in ten groups should type it once and
 * override the two or three outliers, not enter thirty grades — so
 * `followsGroupGrade` records only whether an override exists, and the effective
 * grade is derived at read time. Re-grading the group then flows to every
 * follower automatically and never disturbs a row a teacher deliberately set.
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
  useGroupGrade,
  now = new Date(),
}: {
  groupId: string;
  membershipId: string;
  gradedByMembershipId: string;
  score?: string | null;
  feedback?: string | null;
  /** True to show the student, false to take it back, undefined to leave as-is. */
  release?: boolean;
  /** True to drop any override and hand this student back to the group grade. */
  useGroupGrade?: boolean;
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

  // A score is what makes a grade individual. Clearing it, or asking explicitly,
  // hands the student back to whatever the group is graded.
  const follows = useGroupGrade ? true : cleanScore === null;
  const storedScore = follows ? null : cleanScore;

  await prisma.documentGroupMemberGrade.upsert({
    where: { groupId_membershipId: { groupId, membershipId } },
    create: {
      groupId,
      membershipId,
      gradedByMembershipId,
      followsGroupGrade: follows,
      score: storedScore,
      feedback: cleanFeedback,
      // Unreleased by default: nothing reaches a student while the teacher is
      // still working through the group.
      releasedAt: releasedAt ?? null,
    },
    update: {
      gradedByMembershipId,
      followsGroupGrade: follows,
      score: storedScore,
      feedback: cleanFeedback,
      ...(release === undefined ? {} : { releasedAt }),
    },
  });

  return { saved: true as const };
}

export async function readMemberGrades({
  groupId,
}: {
  groupId: string;
}): Promise<Map<string, MemberGrade>> {
  const rows = await prisma.documentGroupMemberGrade.findMany({
    where: { groupId },
    select: {
      membershipId: true,
      followsGroupGrade: true,
      score: true,
      feedback: true,
      releasedAt: true,
    },
  });

  return new Map(
    rows.map((row) => [
      row.membershipId,
      {
        followsGroupGrade: row.followsGroupGrade,
        score: row.score,
        feedback: row.feedback,
        releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
      },
    ])
  );
}
