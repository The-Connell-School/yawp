/**
 * Two-tier grading: the pure part, safe for the browser.
 *
 * Persistence lives in `group-grade.server.ts` and `member-grades.server.ts`.
 * This split is not cosmetic — the contribution panel renders the effective
 * grade, and importing it from a `.server` module pulled Prisma into the client
 * bundle and broke the page. TypeScript cannot see that boundary; only the build
 * can, which is why it is worth keeping the pure half genuinely pure.
 */

export type GroupGrade = {
  submissionId: string;
  score: string | null;
  feedback: string | null;
  submittedAt: string;
  releasedAt: string | null;
};

export type MemberGrade = {
  followsGroupGrade: boolean;
  score: string | null;
  feedback: string | null;
  releasedAt: string | null;
};

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
