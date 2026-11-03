import { describe, expect, test } from 'bun:test';
import { summarizeGradingRubric } from './grading-rubric-summary';
import { EXIT_TICKET_RUBRIC } from './exit-ticket-rubric';
import { CLASS_STARTER_RUBRIC } from './class-starter-rubric';

describe('summarizeGradingRubric', () => {
  test('names a built-in rubric and lists its bands', () => {
    expect(
      summarizeGradingRubric(
        {
          source: 'exit-ticket-default',
          label: 'Exit Ticket understanding',
          scoringType: 'rubric_points',
          minScore: 0,
          maxScore: 100,
          rubricCategories: EXIT_TICKET_RUBRIC.categories,
        },
        { libraryRubricTitle: null }
      )
    ).toEqual({
      sourceText: 'Built-in rubric: Exit Ticket understanding',
      scaleText: 'Rubric points, 0–100',
      categories: [
        {
          key: 'understanding',
          label: 'Understanding',
          weightPercent: 100,
          levels: [
            '0 · No evidence',
            '1–44 · Names it only',
            '45–80 · Partly there',
            '81–100 · Explains it',
          ],
        },
      ],
    });
  });

  test("calls a stored rubric the type's own and lists its score words", () => {
    const summary = summarizeGradingRubric(
      {
        source: 'assignment-type',
        label: 'Class Starter',
        scoringType: 'points_scale',
        minScore: 0,
        maxScore: 3,
        rubricCategories: CLASS_STARTER_RUBRIC.categories,
      },
      { libraryRubricTitle: null }
    );
    expect(summary.sourceText).toBe("This type's own rubric");
    expect(summary.scaleText).toBe('Points, 0–3');
    expect(summary.categories[0]?.levels).toEqual([
      '0 · Absent',
      '1 · Hardly there',
      '2 · Showed up',
      '3 · All in',
    ]);
  });

  test('names the library rubric a type selected', () => {
    expect(
      summarizeGradingRubric(
        {
          source: 'assignment-type',
          label: 'Daily Pages',
          scoringType: 'weighted_1_5',
          minScore: 1,
          maxScore: 5,
          rubricCategories: [
            {
              key: 'thesis',
              label: 'Thesis',
              weight: 0.25,
            },
          ],
        },
        { libraryRubricTitle: 'Daily Pages engagement' }
      )
    ).toMatchObject({
      sourceText: 'Library rubric: Daily Pages engagement',
      scaleText: 'Weighted 1–5, 1–5',
      categories: [
        { key: 'thesis', label: 'Thesis', weightPercent: 25, levels: [] },
      ],
    });
  });

  test('falls back to the raw scale name it does not know', () => {
    expect(
      summarizeGradingRubric(
        {
          source: 'assignment-type',
          label: 'X',
          scoringType: 'something_new',
          minScore: 2,
          maxScore: 9,
          rubricCategories: [],
        },
        { libraryRubricTitle: null }
      ).scaleText
    ).toBe('something_new, 2–9');
  });

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
