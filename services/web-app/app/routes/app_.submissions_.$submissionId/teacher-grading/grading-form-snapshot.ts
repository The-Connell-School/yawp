import { type GrammarIssue } from '~/domain/grading/grammarIssues';
import { type RubricScore } from '~/domain/grading/rubric-display';

export function buildGradingFormSnapshot({
  rubricScores,
  overallComment,
  numericPercentage,
  overallScore = '',
  grammarIssues,
}: {
  rubricScores: Record<string, RubricScore>;
  overallComment: string;
  numericPercentage: string;
  /**
   * The teacher's own total on a points scale, empty while the field is still
   * mirroring the category scores. Empty rather than the mirrored number, so
   * seeding the field on load does not read as an edit.
   */
  overallScore?: string;
  grammarIssues: GrammarIssue[];
}) {
  const trimmedPercentage = numericPercentage.trim();
  const parsedPercentage = Number(trimmedPercentage);
  const normalizedPercentage =
    trimmedPercentage !== '' && Number.isFinite(parsedPercentage)
      ? String(Math.max(0, Math.min(100, Math.round(parsedPercentage))))
      : trimmedPercentage;

  return JSON.stringify({
    rubricScores,
    overallComment,
    numericPercentage: normalizedPercentage,
    overallScore,
    grammarIssues: grammarIssues.map((issue) => ({
      id: issue.id,
      excerpt: issue.excerpt,
      kind: issue.kind,
      message: issue.message,
      ruleNumber: issue.ruleNumber,
      rule: issue.rule,
    })),
  });
}
