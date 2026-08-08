import { isScored } from '~/domain/grading/rubric-display';

type RubricScore = { score: number; comment: string };

/**
 * True when the teacher has entered any grading content that Grading Assistant would overwrite.
 *
 * `minScore` is the active rubric's floor. A scale that starts at 0 makes 0 a
 * real judgment ("Absent" on Daily Pages), so what counts as scored is the
 * scale's own floor rather than a truthiness check that would read Absent as
 * blank and skip the overwrite confirmation.
 */
export function hasGradingDraftToReplace(
  rubricScores: Record<string, RubricScore>,
  overallComment: string,
  numericPercentage: string,
  grammarIssueCount: number,
  minScore = 1
): boolean {
  if (grammarIssueCount > 0) return true;
  if (overallComment.trim().length > 0) return true;
  if (numericPercentage.trim() !== '') return true;
  for (const r of Object.values(rubricScores)) {
    if (!r) continue;
    if (isScored(r.score, minScore)) return true;
    if (r.comment.trim().length > 0) return true;
  }
  return false;
}
