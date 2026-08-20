import { describe, expect, test } from 'bun:test';
import { buildGradingFormSnapshot } from './grading-form-snapshot';

const base = {
  rubricScores: {},
  overallComment: 'Feedback',
  overallScore: '',
  grammarIssues: [],
};

describe('buildGradingFormSnapshot', () => {
  test('treats normalized percentage spellings as the same draft', () => {
    const saved = buildGradingFormSnapshot({
      ...base,
      numericPercentage: '77',
    });

    expect(
      buildGradingFormSnapshot({ ...base, numericPercentage: ' 77.0 ' })
    ).toBe(saved);
  });

  test('uses the same rounding and bounds as the save payload', () => {
    expect(
      buildGradingFormSnapshot({ ...base, numericPercentage: '100.4' })
    ).toBe(
      buildGradingFormSnapshot({ ...base, numericPercentage: '101' })
    );
    expect(
      buildGradingFormSnapshot({ ...base, numericPercentage: '-2' })
    ).toBe(buildGradingFormSnapshot({ ...base, numericPercentage: '0' }));
  });
});
