export type AssignmentScoringMode = 'weighted_categories' | 'holistic_tier';

export function isHolisticTierScoringMode(
  scoringMode: AssignmentScoringMode | null | undefined
): boolean {
  return scoringMode === 'holistic_tier';
}

/** Reads holistic mode from persisted grade metadata when present. */
export function scoringModeFromAiMeta(aiMeta: unknown): AssignmentScoringMode | undefined {
  if (!aiMeta || typeof aiMeta !== 'object' || Array.isArray(aiMeta)) {
    return undefined;
  }
  const mode = (aiMeta as { scoringMode?: unknown }).scoringMode;
  return mode === 'holistic_tier' ? 'holistic_tier' : undefined;
}
