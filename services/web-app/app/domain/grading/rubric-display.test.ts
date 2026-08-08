import { describe, expect, test } from 'bun:test';
import {
  buildScoreOptions,
  normalizeRubricDisplayConfig,
  normalizeRubricScoresForCategories,
} from './rubric-display';

const actCategories = [
  {
    key: 'ideas_and_analysis',
    label: 'Ideas and Analysis',
    description: '',
    weight: 1,
  },
];

describe('normalizeRubricScoresForCategories', () => {
  test('preserves zero as an unscored rubric value', () => {
    const normalized = normalizeRubricScoresForCategories({
      raw: {
        ideas_and_analysis: {
          score: 0,
          comment: '',
        },
      },
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
    });

    expect(normalized.ideas_and_analysis.score).toBe(0);
  });
});

describe('normalizeRubricDisplayConfig', () => {
  test('preserves a thesis-default source flag so the UI can warn about the fallback', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
      source: 'thesis-default',
    });

    expect(normalized.source).toBe('thesis-default');
  });

  test('preserves an assignment-type source flag', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
      source: 'assignment-type',
    });

    expect(normalized.source).toBe('assignment-type');
  });

  test('drops an unrecognized source value', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
      source: 'bogus',
    });

    expect(normalized.source).toBeUndefined();
  });

  test('preserves the customizable per-category options', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: [
        {
          key: 'daily_habit',
          label: 'Daily Habit',
          description: 'Did the student write today?',
          weight: 1,
          scoreLabels: [{ value: 1, label: 'Skipped' }],
          feedbackEnabled: false,
          grammarHighlighting: false,
        },
      ],
      minScore: 1,
      maxScore: 5,
      scoringType: 'weighted_1_5',
    });

    expect(normalized.categories[0].scoreLabels).toEqual([
      { value: 1, label: 'Skipped' },
    ]);
    expect(normalized.categories[0].feedbackEnabled).toBe(false);
    expect(normalized.categories[0].grammarHighlighting).toBe(false);
  });

  test('leaves the new options undefined for categories that predate them', () => {
    const normalized = normalizeRubricDisplayConfig({
      categories: actCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
    });

    expect(normalized.categories[0].scoreLabels).toBeUndefined();
    expect(normalized.categories[0].feedbackEnabled).toBeUndefined();
    expect(normalized.categories[0].grammarHighlighting).toBeUndefined();
  });
});

describe('buildScoreOptions', () => {
  test('keeps the legacy 1-5 labels when no per-category labels are supplied', () => {
    expect(buildScoreOptions(1, 5)).toEqual([
      { value: '1', label: '1 - Needs Improvement' },
      { value: '2', label: '2 - Developing' },
      { value: '3', label: '3 - Proficient' },
      { value: '4', label: '4 - Strong' },
      { value: '5', label: '5 - Exemplary' },
    ]);
  });

  test('keeps bare numbers for non 1-5 scales when no labels are supplied', () => {
    expect(buildScoreOptions(2, 4).map((option) => option.label)).toEqual([
      '2',
      '3',
      '4',
    ]);
  });

  test('uses per-category score labels when supplied', () => {
    expect(
      buildScoreOptions(1, 3, [
        { value: 1, label: 'Skipped' },
        { value: 2, label: 'Showed up' },
        { value: 3, label: 'Every day' },
      ])
    ).toEqual([
      { value: '1', label: '1 - Skipped' },
      { value: '2', label: '2 - Showed up' },
      { value: '3', label: '3 - Every day' },
    ]);
  });

  test('falls back per score value when only some labels are supplied', () => {
    expect(
      buildScoreOptions(1, 5, [{ value: 2, label: 'Getting there' }]).map(
        (option) => option.label
      )
    ).toEqual([
      '1 - Needs Improvement',
      '2 - Getting there',
      '3 - Proficient',
      '4 - Strong',
      '5 - Exemplary',
    ]);
  });

  test('ignores labels for score values outside the configured range', () => {
    expect(
      buildScoreOptions(1, 2, [
        { value: 9, label: 'Off the chart' },
      ]).map((option) => option.label)
    ).toEqual(['1', '2']);
  });
});
