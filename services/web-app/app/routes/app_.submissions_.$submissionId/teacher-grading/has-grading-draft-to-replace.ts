type RubricScore = { score: number; comment: string };

/**
 * True when the teacher has entered any grading content that Grading Assistant would overwrite.
 */
export function hasGradingDraftToReplace(
  rubricScores: Record<string, RubricScore>,
  overallComment: string,
  numericPercentage: string,
  grammarIssueCount: number
): boolean {
  if (grammarIssueCount > 0) return true;
  if (overallComment.trim().length > 0) return true;
  if (numericPercentage.trim() !== '') return true;
  for (const r of Object.values(rubricScores)) {
    if (!r) continue;
    if (r.score > 0) return true;
    if (r.comment.trim().length > 0) return true;
  }
  return false;
}
