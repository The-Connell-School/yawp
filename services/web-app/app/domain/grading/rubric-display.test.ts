import { describe, expect, test } from 'bun:test';
import {
  buildEmptyRubricScores,
  buildScoreOptions,
  isScored,
  mergeRubricDisplayPickerRestrictions,
  normalizeRubricDisplayConfig,
  normalizeRubricScoresForCategories,
  parseRubricDisplaySource,
  toPersistedRubricScores,
  unscoredValue,
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

  test('preserves legacy bare-number category scores', () => {
    expect(
      normalizeRubricScoresForCategories({
        raw: { ideas_and_analysis: 5 },
        categories: actCategories,
        minScore: 1,
        maxScore: 6,
      })
    ).toEqual({
      ideas_and_analysis: { score: 5, comment: '', isAi: false },
    });
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
          bands: [
            {
              min: 0,
              max: 5,
              label: 'Raw points',
              description: 'Score this section out of five.',
            },
          ],
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
    expect(normalized.categories[0].bands).toEqual([
      {
        min: 0,
        max: 5,
        label: 'Raw points',
        description: 'Score this section out of five.',
      },
    ]);
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
      { value: '1', label: 'Needs Improvement' },
      { value: '2', label: 'Developing' },
      { value: '3', label: 'Proficient' },
      { value: '4', label: 'Strong' },
      { value: '5', label: 'Exemplary' },
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
      { value: '1', label: 'Skipped' },
      { value: '2', label: 'Showed up' },
      { value: '3', label: 'Every day' },
    ]);
  });

  test('falls back per score value when only some labels are supplied', () => {
    expect(
      buildScoreOptions(1, 5, [{ value: 2, label: 'Getting there' }]).map(
        (option) => option.label
      )
    ).toEqual([
      'Needs Improvement',
      'Getting there',
      'Proficient',
      'Strong',
      'Exemplary',
    ]);
  });

  test('ignores labels for score values outside the configured range', () => {
    expect(
      buildScoreOptions(1, 2, [{ value: 9, label: 'Off the chart' }]).map(
        (option) => option.label
      )
    ).toEqual(['1', '2']);
  });

  test('uses a category band range instead of the rubric-wide maximum', () => {
    expect(
      buildScoreOptions(0, 20, undefined, 1, [
        { min: 0, max: 0, label: 'Absent', description: 'Missing.' },
        { min: 1, max: 2, label: 'Struggling', description: 'Incomplete.' },
        { min: 3, max: 3, label: 'Developing', description: 'Generic.' },
        { min: 4, max: 4, label: 'Proficient', description: 'Clear.' },
        { min: 5, max: 5, label: 'Exemplary', description: 'Purposeful.' },
      ]).map((option) => option.value)
    ).toEqual(['0', '1', '2', '3', '4', '5']);
  });

  test('uses band labels without adding numeric prefixes', () => {
    expect(
      buildScoreOptions(0, 5, undefined, 1, [
        { min: 0, max: 0, label: 'Absent', description: 'Missing.' },
        { min: 1, max: 2, label: 'Hardly there', description: 'Token effort.' },
        { min: 3, max: 5, label: 'All in', description: 'Engaged.' },
      ]).map((option) => option.label)
    ).toEqual(['Absent', 'Hardly there', 'Hardly there', 'All in', 'All in', 'All in']);
  });
});

describe('an unscored value on a scale that starts below 1', () => {
  const engagementCategories = [
    {
      key: 'engagement',
      label: 'Engagement',
      description: '',
      weight: 1,
      scoreLabels: [
        { value: 0, label: 'Absent' },
        { value: 3, label: 'All in' },
      ],
    },
  ];

  test('sits one below the scale, so 0 stays a real score', () => {
    expect(unscoredValue(0)).toBe(-1);
    expect(isScored(0, 0)).toBe(true);
    expect(isScored(-1, 0)).toBe(false);
  });

  test('is still 0 on a scale that starts at 1, exactly as before', () => {
    expect(unscoredValue(1)).toBe(0);
    expect(isScored(0, 1)).toBe(false);
    expect(isScored(1, 1)).toBe(true);
  });

  test('empty scores start unscored rather than at Absent', () => {
    expect(buildEmptyRubricScores(engagementCategories, 0)).toEqual({
      engagement: { score: -1, comment: '' },
    });
  });

  test('keeps a stored Absent instead of reading it as unscored', () => {
    const normalized = normalizeRubricScoresForCategories({
      raw: { engagement: { score: 0, comment: '', isAi: true } },
      categories: engagementCategories,
      minScore: 0,
      maxScore: 3,
    });

    expect(normalized.engagement).toEqual({
      score: 0,
      comment: '',
      isAi: true,
    });
  });

  test('offers Absent as a pickable option', () => {
    expect(
      buildScoreOptions(0, 3, engagementCategories[0].scoreLabels)
    ).toEqual([
      { value: '0', label: 'Absent' },
      { value: '1', label: '1' },
      { value: '2', label: '2' },
      { value: '3', label: 'All in' },
    ]);
  });
});

describe('toPersistedRubricScores', () => {
  test('writes the not-yet-scored sentinel out as null', () => {
    // -1 is the sentinel on a 0-3 scale. Persisting it makes every reader
    // that accepts any finite number average an unscored entry in as a -1.
    expect(
      toPersistedRubricScores({ engagement: { score: -1, comment: '' } }, 0)
    ).toEqual({ engagement: { score: null, comment: '' } });
  });

  test('keeps a real zero on a 0-floor scale', () => {
    expect(
      toPersistedRubricScores({ engagement: { score: 0, comment: '' } }, 0)
    ).toEqual({ engagement: { score: 0, comment: '' } });
  });

  test('writes the legacy 0 sentinel on a 1-5 scale out as null', () => {
    expect(
      toPersistedRubricScores(
        { thesis_and_content: { score: 0, comment: '' } },
        1
      )
    ).toEqual({ thesis_and_content: { score: null, comment: '' } });
  });

  test('keeps a comment written before a score was chosen', () => {
    expect(
      toPersistedRubricScores(
        {
          thesis_and_content: {
            score: 0,
            comment: 'clearer claim',
            isAi: false,
          },
        },
        1
      )
    ).toEqual({
      thesis_and_content: {
        score: null,
        comment: 'clearer claim',
        isAi: false,
      },
    });
  });
});

describe('normalizeRubricScoresForCategories', () => {
  test('reads a persisted null score back as not yet scored', () => {
    const categories = [
      { key: 'engagement', label: 'Engagement', description: '', weight: 1 },
    ];
    expect(
      normalizeRubricScoresForCategories({
        raw: { engagement: { score: null, comment: 'later' } },
        categories,
        minScore: 0,
        maxScore: 3,
      })
    ).toEqual({ engagement: { score: -1, comment: 'later', isAi: false } });
  });
});

describe('parseRubricDisplaySource', () => {
  test('accepts every source a resolved grading config can report', () => {
    for (const source of [
      'assignment-type',
      'thesis-default',
      'daily-pages-default',
      'daily-pages-engagement-default',
      'daily-pages-short-form-default',
      'class-starter-default',
    ]) {
      expect(parseRubricDisplaySource(source)).toBe(source as never);
    }
  });

  test('drops anything else, including a source it cannot recognize', () => {
    expect(parseRubricDisplaySource('act-writing-default')).toBeUndefined();
    expect(parseRubricDisplaySource(null)).toBeUndefined();
    expect(parseRubricDisplaySource(undefined)).toBeUndefined();
    expect(parseRubricDisplaySource(7)).toBeUndefined();
  });
});

describe('mergeRubricDisplayPickerRestrictions', () => {
  test('restores allowedScores from the baseline when the assistant omits them', () => {
    const baseline = normalizeRubricDisplayConfig({
      categories: [
        {
          key: 'engagement_with_prompt',
          label: 'Engagement',
          description: '',
          weight: 1,
          allowedScores: [0, 3, 7, 12],
        },
      ],
      minScore: 0,
      maxScore: 12,
      step: 1,
      scoringType: 'rubric_points',
      scoringMode: 'holistic_tier',
    });
    const fromAssistant = normalizeRubricDisplayConfig({
      categories: [
        {
          key: 'engagement_with_prompt',
          label: 'Engagement',
          description: '',
          weight: 1,
        },
      ],
      minScore: 0,
      maxScore: 12,
      step: 1,
      scoringType: 'rubric_points',
    });
    const merged = mergeRubricDisplayPickerRestrictions(fromAssistant, baseline);
    expect(merged.categories[0].allowedScores).toEqual([0, 3, 7, 12]);
    expect(merged.scoringMode).toBe('holistic_tier');
  });
});
