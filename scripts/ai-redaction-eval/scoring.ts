/**
 * Pure scoring/statistics helpers for the redaction eval harness. No
 * network calls, no app imports — safe to unit test directly.
 */

export interface RubricWeight {
  key: string;
  weight: number;
  maxScore: number;
}

export interface CategoryScore {
  key: string;
  score: number;
}

/**
 * Weighted total as a 0-100 percentage, given per-category scores and the
 * rubric's weights/maxScore. Mirrors the shape of the real weighted_1_5
 * scoring type (score / maxScore, weighted, summed, *100) without
 * reimplementing the app's letter-grade/strictness pipeline — this harness
 * only needs a stable, comparable composite for control vs. treatment, not
 * bit-identical parity with `computeGradeFields`.
 */
export function weightedPercent(
  categories: CategoryScore[],
  weights: RubricWeight[]
): number {
  const weightByKey = new Map(weights.map((w) => [w.key, w]));
  let total = 0;
  for (const cat of categories) {
    const w = weightByKey.get(cat.key);
    if (!w) continue;
    total += (cat.score / w.maxScore) * w.weight * 100;
  }
  return Math.round(total * 100) / 100;
}

export interface Distribution {
  mean: number;
  median: number;
  stdev: number;
  min: number;
  max: number;
  n: number;
}

export function summarizeDistribution(values: number[]): Distribution {
  if (values.length === 0) {
    return { mean: 0, median: 0, stdev: 0, min: 0, max: 0, n: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median =
    n % 2 === 0
      ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
      : sorted[(n - 1) / 2];
  const variance =
    sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  return {
    mean: Math.round(mean * 100) / 100,
    median: Math.round(median * 100) / 100,
    stdev: Math.round(stdev * 100) / 100,
    min: sorted[0],
    max: sorted[n - 1],
    n,
  };
}

export interface CategoryDelta {
  key: string;
  control: number;
  treatment: number;
  delta: number;
}

export function computeCategoryDeltas(
  controlCategories: CategoryScore[],
  treatmentCategories: CategoryScore[]
): CategoryDelta[] {
  const treatmentByKey = new Map(
    treatmentCategories.map((c) => [c.key, c.score])
  );
  return controlCategories.map((c) => {
    const treatment = treatmentByKey.get(c.key) ?? NaN;
    return {
      key: c.key,
      control: c.score,
      treatment,
      delta: Math.round((treatment - c.score) * 100) / 100,
    };
  });
}
