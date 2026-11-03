import { createHash } from 'node:crypto';

export const CLASS_INSIGHT_INPUT_VERSION = 2;

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

/** Only the hash is persisted; student identities never enter the prompt. */
export function classInsightFingerprint(
  inputs: readonly ({ submissionId: string } & Record<string, unknown>)[]
): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        canonical(
          [...inputs]
            .sort((a, b) => a.submissionId.localeCompare(b.submissionId))
            .map(
              ({
                submissionId,
                score,
                overallScore,
                numericPercentage,
                gradedAt,
                releasedAt,
                rubricScores,
                overallComment,
              }) => ({
                submissionId,
                score: score ?? null,
                overallScore: overallScore ?? null,
                numericPercentage: numericPercentage ?? null,
                gradedAt: gradedAt ?? null,
                releasedAt: releasedAt ?? null,
                rubricScores: rubricScores ?? null,
                overallComment: overallComment ?? null,
              })
            )
        )
      )
    )
    .digest('hex');
}

export function isClassInsightCurrent(
  summary: unknown,
  fingerprint: string
): boolean {
  if (!summary || typeof summary !== 'object') return false;
  const cached = summary as Record<string, unknown>;
  return (
    cached.inputVersion === CLASS_INSIGHT_INPUT_VERSION &&
    cached.gradeFingerprint === fingerprint
  );
}
