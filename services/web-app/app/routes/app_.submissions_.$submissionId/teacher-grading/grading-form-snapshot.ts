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
  return JSON.stringify({
    rubricScores,
    overallComment,
    numericPercentage,
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
