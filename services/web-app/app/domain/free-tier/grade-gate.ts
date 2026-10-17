/** Shared with the public grade gate and Internal's read contract. */
export const BELOW_HS_TAG = 'below-hs' as const;
const belowHsGrades = new Set(['K', '1', '2', '3', '4', '5', '6', '7', '8']);

export function isBelowHsGrade(grade: string): boolean {
  return belowHsGrades.has(grade);
}

export function withBelowHsTag(tags: readonly string[] = []): string[] {
  return tags.includes(BELOW_HS_TAG) ? [...tags] : [...tags, BELOW_HS_TAG];
}
