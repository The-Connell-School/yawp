import { apRubricRows, AP_MAX_SCORE, type ApRubricKey } from './ap-rubric';

export type ApRubricScores = {
  thesis: 0 | 1;
  evidence_commentary: 0 | 1 | 2 | 3 | 4;
  sophistication: 0 | 1;
};

export function computeApTotal(scores: ApRubricScores): number {
  return scores.thesis + scores.evidence_commentary + scores.sophistication;
}

export function apScoreDisplay(total: number): string {
  return `${total}/${AP_MAX_SCORE}`;
}

export function computeApTotalFromRecord(
  rubricScores: Record<string, unknown> | null | undefined
): number | null {
  if (!rubricScores || typeof rubricScores !== 'object') return null;

  let total = 0;
  for (const row of apRubricRows) {
    const value = rubricScores[row.key];
    if (typeof value !== 'object' || value === null) return null;
    const score = (value as { score?: unknown }).score;
    if (typeof score !== 'number' || !Number.isInteger(score)) return null;
    if (score < 0 || score > row.maxPoints) return null;
    total += score;
  }

  return total;
}
