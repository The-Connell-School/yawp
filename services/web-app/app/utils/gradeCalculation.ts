/**
 * Grade Calculation Utilities
 *
 * Maps rubric scores (1-5) to percentage grades and calculates weighted averages.
 */

/**
 * Maps a 1-5 rubric score to a percentage grade
 * Score mapping:
 * 5 → 100%
 * 4 → 89%
 * 3 → 79%
 * 2 → 69%
 * 1 → 59%
 */
export function scoreToPercentage(score: number): number {
  const scoreMap: Record<number, number> = {
    5: 100,
    4: 89,
    3: 79,
    2: 69,
    1: 59,
  };

  return scoreMap[score] ?? 0;
}

/**
 * Calculates a weighted average grade from rubric scores
 * @param scores Array of objects with score and weight
 * @returns Percentage grade (0-100)
 */
export function calculateWeightedGrade(
  scores: Array<{ score: number; weight: number }>
): number {
  let totalWeightedScore = 0;
  let totalWeight = 0;

  for (const { score, weight } of scores) {
    const percentage = scoreToPercentage(score);
    totalWeightedScore += percentage * weight;
    totalWeight += weight;
  }

  // Ensure we divide by total weight to get the final percentage
  return totalWeight > 0 ? totalWeightedScore / totalWeight : 0;
}

/**
 * Converts a percentage grade to a letter grade
 */
export function percentageToLetterGrade(percentage: number): string {
  if (percentage >= 93) return 'A';
  if (percentage >= 90) return 'A-';
  if (percentage >= 87) return 'B+';
  if (percentage >= 83) return 'B';
  if (percentage >= 80) return 'B-';
  if (percentage >= 77) return 'C+';
  if (percentage >= 73) return 'C';
  if (percentage >= 70) return 'C-';
  if (percentage >= 67) return 'D+';
  if (percentage >= 63) return 'D';
  if (percentage >= 60) return 'D-';
  return 'F';
}

/**
 * Gets the status of a document for badge display
 */
export function getDocumentStatus(document: {
  submittedAt: Date | null;
  grade?: { isReleased: boolean } | null;
}): 'draft' | 'submitted' | 'graded' {
  if (!document.submittedAt) {
    return 'draft';
  }

  if (document.grade?.isReleased) {
    return 'graded';
  }

  return 'submitted';
}
