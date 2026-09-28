/**
 * Rollout flag for the Composition strand of Writing Fundamentals Practice
 * (constructed-response practice on topic sentences, thesis statements, and —
 * later — evidence and analysis).
 *
 * The grammar/ACT practice is unaffected and always on. Composition is gated so
 * it can ship dark to production and be switched on deliberately:
 *
 * - `COMPOSITION_PRACTICE_ENABLED=true|1`  → force on
 * - `COMPOSITION_PRACTICE_ENABLED=false|0` → force off
 * - unset → on everywhere except production, so it is live in local dev and the
 *   e2e suite while staying behind the flag in prod until explicitly enabled.
 */
export function isCompositionPracticeEnabled(): boolean {
  const raw = process.env.COMPOSITION_PRACTICE_ENABLED?.trim().toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return process.env.NODE_ENV !== 'production';
}
