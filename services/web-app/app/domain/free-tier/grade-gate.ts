/** Shared with the public grade gate and Internal's read contract. */
export const BELOW_HS_TAG = 'below-hs' as const;
/** Elementary grades declined on the public waitlist; middle school (6–8) uses the normal free-tier flow. */
const belowHsGrades = new Set(['K', '1', '2', '3', '4', '5']);

export function isBelowHsGrade(grade: string): boolean {
  return belowHsGrades.has(grade);
}

export function withBelowHsTag(tags: readonly string[] = []): string[] {
  return tags.includes(BELOW_HS_TAG) ? [...tags] : [...tags, BELOW_HS_TAG];
}
