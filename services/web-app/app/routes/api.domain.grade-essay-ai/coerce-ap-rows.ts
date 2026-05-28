import { apRubricRows } from '~/domain/grading/ap-rubric';

export function coerceApRows(
  value: unknown
): Array<{ key: string; score: number; comment: string }> | null {
  const rowsCandidate =
    value && typeof value === 'object'
      ? (value as { rows?: unknown }).rows
      : null;
  if (!Array.isArray(rowsCandidate)) return null;

  const byKey = new Map<string, { score: number; comment: string }>();
  for (const raw of rowsCandidate) {
    if (!raw || typeof raw !== 'object') continue;
    const key = (raw as { key?: unknown }).key;
    const score = (raw as { score?: unknown }).score;
    const comment = (raw as { comment?: unknown }).comment;
    if (typeof key !== 'string') continue;
    if (typeof score !== 'number' || !Number.isFinite(score)) continue;
    byKey.set(key, {
      score,
      comment: typeof comment === 'string' ? comment : '',
    });
  }

  return apRubricRows.map((row) => {
    const found = byKey.get(row.key);
    const clamped = found
      ? Math.max(0, Math.min(row.maxPoints, Math.round(found.score)))
      : 0;
    return { key: row.key, score: clamped, comment: found?.comment ?? '' };
  });
}
