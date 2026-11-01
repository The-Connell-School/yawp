import { assignmentPointTotal } from '~/domain/grading/gradeMath';

/**
 * The teacher's total score field: what it is out of, and which numbers it
 * keeps.
 *
 * The rule a teacher relies on: once an assignment has a point value, the
 * field keeps every whole number from zero to that value. It never snaps a
 * typed score onto the rubric's bands or steps, because the rubric's scale is
 * not the assignment's — a Class Starter scored 0-2 is worth 10 points, and a
 * 7 the teacher types has to be the 7 the gradebook shows. Only legacy
 * assignments with no point value fall back to the rubric's own range and
 * step.
 */

export type ScoreFieldScale = {
  isRawPoints: boolean;
  scoringType: string;
  minScore: number;
  maxScore: number;
  step?: number | null;
};

export type ScoreFieldBounds = { min: number; max: number; step: number };

/** What the score field is out of: the point value, else the rubric's own total. */
export function scoreFieldOutOf(
  scale: ScoreFieldScale,
  pointValue: number | null | undefined
): number {
  return assignmentPointTotal(
    pointValue,
    scale.isRawPoints
      ? scale.scoringType === 'act_writing_2_12'
        ? 12
        : scale.maxScore
      : 100
  );
}

export function scoreFieldBounds(
  scale: ScoreFieldScale,
  pointValue: number | null | undefined
): ScoreFieldBounds {
  const outOf = scoreFieldOutOf(scale, pointValue);
  const isRubricRange = outOf === scale.maxScore;
  return {
    min:
      scale.isRawPoints && pointValue == null && isRubricRange
        ? scale.minScore
        : 0,
    max: outOf,
    step: pointValue != null ? 1 : isRubricRange ? (scale.step ?? 1) : 1,
  };
}

/**
 * The nearest score the scale actually offers. A typed 17 on a 0-30 rubric
 * scored in tens becomes 20; anything outside the range is pulled to its
 * nearest end.
 */
export function snapToScaleValue(
  value: number,
  bounds: ScoreFieldBounds | null,
  fallbackMax: number
): number {
  if (!bounds) return Math.max(0, Math.min(fallbackMax, Math.round(value)));

  const clamped = Math.max(bounds.min, Math.min(bounds.max, value));
  const steps = Math.round((clamped - bounds.min) / bounds.step);
  return Math.min(bounds.max, bounds.min + steps * bounds.step);
}
