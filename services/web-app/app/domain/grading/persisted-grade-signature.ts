import { rubricCategories } from './rubric';
import type { GrammarIssue } from './grammarIssues';

type RubricScore = {
  score: number;
  comment: string;
};

export function buildPersistedGradeSignature(args: {
  overallComment: string;
  numericPercentage: number | null;
  rubricScores: Record<string, RubricScore>;
  grammarIssues: GrammarIssue[];
}) {
  const rubricSignature = rubricCategories
    .map((item) => {
      const score = args.rubricScores[item.key]?.score ?? 0;
      const comment = args.rubricScores[item.key]?.comment ?? '';
      return `${item.key}:${score}:${comment}`;
    })
    .join('|');

  const grammarSignature = JSON.stringify(
    args.grammarIssues.map((issue) => ({
      id: issue.id,
      excerpt: issue.excerpt,
      occurrence: issue.occurrence ?? 1,
      kind: issue.kind,
      ruleNumber: issue.ruleNumber ?? null,
      rule: issue.rule ?? null,
      message: issue.message,
    }))
  );

  return [
    args.overallComment,
    args.numericPercentage === null
      ? 'null'
      : args.numericPercentage.toString(),
    rubricSignature,
    grammarSignature,
  ].join('||');
}
