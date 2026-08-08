import { describe, expect, test } from 'bun:test';

import {
  MODULE_RUBRIC_RELATIONSHIPS,
  getThesisDefaultRubricConfig,
  hasAssignmentTypeOwnedRubric,
  normalizeModuleRubricAlignment,
  parseAssignmentTypeRubricConfig,
} from './assignment-type-rubric-config';

describe('parseAssignmentTypeRubricConfig', () => {
  test('parses assignment-type-owned rubric config with categories intact', () => {
    const config = parseAssignmentTypeRubricConfig({
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: {
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 0.4,
          },
          {
            key: 'evidence',
            label: 'Evidence',
            description: 'Relevant evidence supports the claim.',
            weight: 0.6,
          },
        ],
      },
      gradingPromptConfigJson: { gradingInstructions: 'Grade against this rubric.' },
      gradingOutputSchemaJson: { schemaVersion: 2 },
      gradingCalibrationNotes: 'Pilot notes',
    });

    expect(config.source).toBe('assignment-type');
    expect(config.rubric.categories).toEqual([
      {
        key: 'claim',
        label: 'Claim',
        description: 'A clear defensible claim.',
        weight: 0.4,
      },
      {
        key: 'evidence',
        label: 'Evidence',
        description: 'Relevant evidence supports the claim.',
        weight: 0.6,
      },
    ]);
    expect(config.promptConfig.gradingInstructions).toBe('Grade against this rubric.');
    expect(config.outputSchema).toEqual({ schemaVersion: 2 });
    expect(config.calibrationNotes).toBe('Pilot notes');
  });

  test('falls back to Thesis defaults when rubric config is missing or empty', () => {
    const config = parseAssignmentTypeRubricConfig({
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: { categories: [] },
    });

    expect(config.source).toBe('thesis-default');
    expect(config.rubric.categories.map((category) => category.key)).toContain(
      'grammar_and_mechanics'
    );
    expect(
      config.rubric.categories.find(
        (category) => category.key === 'grammar_and_mechanics'
      )?.weight
    ).toBe(0.1);
    expect(config.promptConfig.instructionsPreset).toBe('legacy_thesis_driven_essay');
  });
});

describe('hasAssignmentTypeOwnedRubric', () => {
  test('returns false for empty or incomplete categories', () => {
    expect(hasAssignmentTypeOwnedRubric({ categories: [] })).toBe(false);
    expect(
      hasAssignmentTypeOwnedRubric({
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: '',
            weight: 1,
          },
        ],
      })
    ).toBe(false);
  });

  test('returns true when the only category is complete', () => {
    expect(
      hasAssignmentTypeOwnedRubric({
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 1,
          },
        ],
      })
    ).toBe(true);
  });

  test('returns false when only some categories are complete (partially-filled rubric)', () => {
    expect(
      hasAssignmentTypeOwnedRubric({
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 0.5,
          },
          {
            key: 'evidence',
            label: 'Evidence',
            description: '',
            weight: 0.5,
          },
        ],
      })
    ).toBe(false);
  });

  test('returns true only when every category is fully populated', () => {
    expect(
      hasAssignmentTypeOwnedRubric({
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 0.5,
          },
          {
            key: 'evidence',
            label: 'Evidence',
            description: 'Relevant evidence supports the claim.',
            weight: 0.5,
          },
        ],
      })
    ).toBe(true);
  });
});

describe('getThesisDefaultRubricConfig', () => {
  test('returns the thesis-driven essay fallback rubric', () => {
    const config = getThesisDefaultRubricConfig();

    expect(config.source).toBe('thesis-default');
    expect(config.rubric.categories.map((category) => category.key)).toContain(
      'thesis_and_content'
    );
  });
});

describe('normalizeModuleRubricAlignment', () => {
  const categories = [
    {
      key: 'claim',
      label: 'Claim',
      description: 'A clear defensible claim.',
      weight: 0.4,
    },
    {
      key: 'evidence',
      label: 'Evidence',
      description: 'Relevant evidence supports the claim.',
      weight: 0.6,
    },
  ];

  test('uses the exact module rubric relationship options', () => {
    expect(MODULE_RUBRIC_RELATIONSHIPS).toEqual([
      'primary',
      'supporting',
      'preparatory',
      'not-applicable',
    ]);
  });

  test('keeps known category relationships and defaults missing categories to not-applicable', () => {
    const alignment = normalizeModuleRubricAlignment(
      {
        claim: 'primary',
        unknown_category: 'supporting',
      },
      categories
    );

    expect(alignment).toEqual({
      claim: 'primary',
      evidence: 'not-applicable',
    });
  });

  test('normalizes unknown relationship values to not-applicable', () => {
    const alignment = normalizeModuleRubricAlignment(
      {
        claim: 'critical',
        evidence: 'preparatory',
      },
      categories
    );

    expect(alignment).toEqual({
      claim: 'not-applicable',
      evidence: 'preparatory',
    });
  });
});
