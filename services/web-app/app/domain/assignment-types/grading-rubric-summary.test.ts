import { describe, expect, test } from 'bun:test';
import { summarizeGradingRubric } from './grading-rubric-summary';

describe('summarizeGradingRubric', () => {
  test('describes a library rubric with band labels', () => {
    const summary = summarizeGradingRubric(
      {
        source: 'daily-pages-engagement-default',
        label: 'Daily Pages',
        scoringType: 'rubric_points',
        minScore: 0,
        maxScore: 30,
        rubricCategories: [
          {
            key: 'engagement_with_prompt',
            label: 'Engagement',
            weight: 1,
            bands: [
              { min: 0, max: 10, label: 'HARDLY THERE', description: 'Low' },
              { min: 11, max: 20, label: 'SHOWED UP', description: 'Mid' },
              { min: 21, max: 30, label: 'ALL IN', description: 'High' },
            ],
          },
        ],
      },
      { libraryRubricTitle: 'Daily Pages engagement' }
    );

    expect(summary.sourceText).toBe('Library rubric: Daily Pages engagement');
    expect(summary.scaleText).toBe('Rubric points, 0–30');
    expect(summary.categories[0]?.levels).toEqual([
      '0–10 · HARDLY THERE',
      '11–20 · SHOWED UP',
      '21–30 · ALL IN',
    ]);
  });
});
