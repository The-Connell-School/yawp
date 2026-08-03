import { type GrammarIssue } from '~/domain/grading/grammarIssues';
import { type RubricScore } from '~/domain/grading/rubric-display';

export function buildGradingFormSnapshot({
  rubricScores,
  overallComment,
  numericPercentage,
  grammarIssues,
}: {
  rubricScores: Record<string, RubricScore>;
  overallComment: string;
  numericPercentage: string;
  grammarIssues: GrammarIssue[];
}) {
  return JSON.stringify({
    rubricScores,
    overallComment,
    numericPercentage,
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
