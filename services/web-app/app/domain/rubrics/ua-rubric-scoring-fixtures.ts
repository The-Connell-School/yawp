/** Approved exemplary Introduction for GBA 300: International Etiquette. */
export const GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY = `Japan and Brazil sit at opposite ends of how business relationships are built. Japan relies on formality, hierarchy, and indirect communication, while Brazil leans on personal warmth, flexible timing, and rapport before deal talk. That contrast makes the pairing useful for anyone preparing teams for negotiations, client visits, or cross-border partnerships. Studying both side by side helps a manager avoid reading Brazilian informality as unprofessional or Japanese reserve as disinterest.`;

/** Expected raw score when the Introduction earns the top band. */
export const GBA300_ETIQUETTE_INTRODUCTION_EXEMPLARY_SCORE = 5;

/** Exemplary raw-point scores for every International Etiquette category. */
export const GBA300_ETIQUETTE_EXEMPLARY_SCORES = {
  introduction: 5,
  country_1_its_two_topics: 20,
  country_2_its_two_topics: 20,
  conclusion: 5,
} as const;

/** Scores that would appear on a misconfigured generic 100-point scale. */
export const GBA300_ETIQUETTE_INVALID_GENERIC_SCORES = {
  introduction: 100,
  country_1_its_two_topics: 100,
  country_2_its_two_topics: 100,
  conclusion: 100,
} as const;
