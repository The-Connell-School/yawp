/**
 * The score values a rubric scale actually offers.
 *
 * A scale is a range plus a step: 1-5 by ones, or 0-30 by tens, which is four
 * tiers rather than thirty-one. Before steps existed every scale walked the
 * range one at a time, so an absent step means 1 and every rubric written
 * before this behaves exactly as it did.
 *
 * Both the rubric editor's score-label rows and the teacher's score dropdown
 * are generated from here, so the two can never disagree about what a rubric
 * offers.
 */

export const DEFAULT_SCORE_STEP = 1;

export type ScoreScaleShape = {
  minScore: number;
  maxScore: number;
  step?: number;
};

/** A step that is missing, fractional, or below one means "every value". */
export function normalizeScoreStep(step: number | undefined | null) {
  if (typeof step !== 'number' || !Number.isFinite(step)) {
    return DEFAULT_SCORE_STEP;
  }
  const whole = Math.floor(step);
  return whole >= 1 ? whole : DEFAULT_SCORE_STEP;
}

export function buildScoreScaleValues({
  minScore,
  maxScore,
  step,
}: ScoreScaleShape): number[] {
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) return [];
  if (maxScore < minScore) return [];

  const increment = normalizeScoreStep(step);
  const values: number[] = [];
  for (let value = minScore; value <= maxScore; value += increment) {
    values.push(value);
  }
  return values;
}

/**
 * Why this scale cannot be saved, or null when it can.
 *
 * The divisibility rule is the one worth being strict about: a step that
 * overshoots the max leaves full marks unreachable, and a teacher only finds
 * out when a perfect essay cannot be given a perfect score.
 */
export function validateScoreScale({
  minScore,
  maxScore,
  step,
}: ScoreScaleShape): string | null {
  if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) {
    return 'The min and max score must both be numbers.';
  }
  if (maxScore <= minScore) {
    return 'The max score must be greater than the min score.';
  }
  if (
    step !== undefined &&
    (typeof step !== 'number' ||
      !Number.isFinite(step) ||
      Math.floor(step) !== step ||
      step < 1)
  ) {
    return 'The step must be a whole number of at least 1.';
  }

  const increment = normalizeScoreStep(step);
  if (increment > maxScore - minScore) {
    return 'The step cannot be larger than the distance between the min and max score.';
  }
  if ((maxScore - minScore) % increment !== 0) {
    const values = buildScoreScaleValues({ minScore, maxScore, step });
    return `A step of ${increment} never reaches the max score of ${maxScore}. It would produce ${values.join(', ')}.`;
  }
  return null;
}

/**
 * The steps a given range can actually use.
 *
 * A step has to divide the range evenly or the max is unreachable — 0-3 by
 * twos stops at 2, so full marks cannot be earned. It also has to leave at
 * least three tiers: a step equal to half the range or more collapses the
 * scale to two values, which is a narrower range rather than a step of this
 * one. A step of 1 is always offered, since every range supports it.
 *
 * Offering only these makes the invalid cases unpickable instead of typeable,
 * which is why the editor uses a select rather than a number input.
 */
export function buildStepOptions({
  minScore,
  maxScore,
}: Pick<ScoreScaleShape, 'minScore' | 'maxScore'>): number[] {
  const span = maxScore - minScore;
  if (!Number.isFinite(span) || span <= 0) return [DEFAULT_SCORE_STEP];

  const options: number[] = [];
  for (let step = 1; step <= span / 2; step++) {
    if (span % step === 0) options.push(step);
  }
  return options.length > 0 ? options : [DEFAULT_SCORE_STEP];
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : greatestCommonDivisor(b, a % b);
}

/**
 * The step a set of score values implies: the largest interval that lands on
 * every one of them.
 *
 * Tier values are often the only record of a stepped scale — a rubric snapshot
 * taken before steps existed still lists its tiers, and an extraction reports
 * them more reliably than it reports the interval itself.
 */
export function inferStepFromScoreValues(
  values: number[],
  minScore: number
): number | null {
  const offsets = values
    .map((value) => Math.abs(value - minScore))
    .filter((offset) => offset > 0);
  if (offsets.length === 0) return null;

  const step = offsets.reduce((acc, offset) =>
    greatestCommonDivisor(acc, offset)
  );
  return step >= 1 ? step : null;
}

/** Human-readable preview of the grid, for helper text beside the inputs. */
export function describeScoreScale(shape: ScoreScaleShape): string {
  const values = buildScoreScaleValues(shape);
  if (values.length === 0) return '';

  const shown =
    values.length > 8
      ? `${values.slice(0, 6).join(', ')} … ${values[values.length - 1]}`
      : values.join(', ');
  return `${values.length} score label${values.length === 1 ? '' : 's'}: ${shown}`;
}
