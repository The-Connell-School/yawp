/**
 * Emergency kill switch layered over the default-false organization gate for
 * Composition Drills. The process environment may turn the feature off, but
 * can never turn an organization on.
 */
export function isCompositionPracticeEnabled(
  organizationEnabled: boolean | undefined
): boolean {
  const raw = process.env.COMPOSITION_DRILLS_ENABLED?.trim().toLowerCase();
  if (raw === 'false' || raw === '0') return false;
  return organizationEnabled === true;
}
