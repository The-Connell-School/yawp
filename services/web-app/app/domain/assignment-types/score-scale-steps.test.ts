import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SCORE_STEP,
  buildScoreScaleValues,
  buildStepOptions,
  describeScoreScale,
  validateScoreScale,
} from './score-scale-steps';

describe('buildScoreScaleValues', () => {
  test('steps by one when no step is configured', () => {
    expect(buildScoreScaleValues({ minScore: 1, maxScore: 5 })).toEqual([
      1, 2, 3, 4, 5,
    ]);
  });

  test('includes both ends of the range', () => {
    // 0 to 30 by tens is four tiers, not three: 0 counts.
    expect(
      buildScoreScaleValues({ minScore: 0, maxScore: 30, step: 10 })
    ).toEqual([0, 10, 20, 30]);
  });

  test('a step of one over a wide range gives every value', () => {
    expect(buildScoreScaleValues({ minScore: 0, maxScore: 30 })).toHaveLength(
      31
    );
  });

  test('stops at the max rather than overshooting it', () => {
    expect(
      buildScoreScaleValues({ minScore: 0, maxScore: 30, step: 4 })
    ).toEqual([0, 4, 8, 12, 16, 20, 24, 28]);
  });

  test('a step wider than the range leaves only the minimum', () => {
    expect(
      buildScoreScaleValues({ minScore: 0, maxScore: 3, step: 10 })
    ).toEqual([0]);
  });

  test('treats a missing or nonsense step as one', () => {
    expect(
      buildScoreScaleValues({ minScore: 1, maxScore: 3, step: 0 })
    ).toEqual([1, 2, 3]);
    expect(
      buildScoreScaleValues({ minScore: 1, maxScore: 3, step: -5 })
    ).toEqual([1, 2, 3]);
  });
});

describe('validateScoreScale', () => {
  test('accepts a range the step divides evenly', () => {
    expect(
      validateScoreScale({ minScore: 0, maxScore: 30, step: 10 })
    ).toBeNull();
  });

  test('accepts the default step', () => {
    expect(validateScoreScale({ minScore: 1, maxScore: 5 })).toBeNull();
  });

  // Otherwise the top of the scale is unreachable and nobody can earn full
  // marks, which is silent and expensive to discover from a gradebook.
  test('rejects a range the step cannot reach the top of', () => {
    expect(validateScoreScale({ minScore: 0, maxScore: 30, step: 4 })).toBe(
      'A step of 4 never reaches the max score of 30. It would produce 0, 4, 8, 12, 16, 20, 24, 28.'
    );
  });

  test('rejects a step wider than the range', () => {
    expect(validateScoreScale({ minScore: 0, maxScore: 5, step: 10 })).toBe(
      'The step cannot be larger than the distance between the min and max score.'
    );
  });

  test('rejects a step below one', () => {
    expect(validateScoreScale({ minScore: 0, maxScore: 10, step: 0 })).toBe(
      'The step must be a whole number of at least 1.'
    );
  });

  test('rejects a max at or below the min', () => {
    expect(validateScoreScale({ minScore: 5, maxScore: 5, step: 1 })).toBe(
      'The max score must be greater than the min score.'
    );
  });
});

describe('buildStepOptions', () => {
  // Only steps that divide the range evenly can reach the max, and a step that
  // leaves fewer than three tiers is a range of its own, not a step of this one.
  test('offers the divisors of the range that leave at least three tiers', () => {
    expect(buildStepOptions({ minScore: 0, maxScore: 6 })).toEqual([1, 2, 3]);
  });

  test('rules out a step that overshoots the max', () => {
    // 0-3 by twos would give 0 and 2, never 3.
    expect(buildStepOptions({ minScore: 0, maxScore: 3 })).toEqual([1]);
  });

  test('offers the tens on a 0-30 scale', () => {
    expect(buildStepOptions({ minScore: 0, maxScore: 30 })).toEqual([
      1, 2, 3, 5, 6, 10, 15,
    ]);
  });

  test('always offers a step of one, even on the narrowest range', () => {
    expect(buildStepOptions({ minScore: 0, maxScore: 1 })).toEqual([1]);
    expect(buildStepOptions({ minScore: 1, maxScore: 5 })).toEqual([1, 2]);
  });

  test('offers only one for a range that is not a range', () => {
    expect(buildStepOptions({ minScore: 5, maxScore: 5 })).toEqual([1]);
    expect(buildStepOptions({ minScore: 9, maxScore: 2 })).toEqual([1]);
  });
});

describe('describeScoreScale', () => {
  test('names the count and lists the values', () => {
    expect(describeScoreScale({ minScore: 0, maxScore: 30, step: 10 })).toBe(
      '4 score labels: 0, 10, 20, 30'
    );
  });

  test('abbreviates a long list rather than filling the sheet', () => {
    expect(describeScoreScale({ minScore: 0, maxScore: 30 })).toBe(
      '31 score labels: 0, 1, 2, 3, 4, 5 … 30'
    );
  });

  test('says nothing useful for an invalid scale', () => {
    expect(describeScoreScale({ minScore: 5, maxScore: 1 })).toBe('');
  });
});

describe('DEFAULT_SCORE_STEP', () => {
  test('is one, so every rubric written before steps existed is unchanged', () => {
    expect(DEFAULT_SCORE_STEP).toBe(1);
  });
});
