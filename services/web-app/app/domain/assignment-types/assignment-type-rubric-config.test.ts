import { describe, expect, test } from 'bun:test';

import {
  MODULE_RUBRIC_RELATIONSHIPS,
  classifyAssignmentTypeRubric,
  getThesisDefaultRubricConfig,
  hasAssignmentTypeOwnedRubric,
  isRubricFullyPopulated,
  normalizeModuleRubricAlignment,
  parseAssignmentTypeRubricConfig,
} from './assignment-type-rubric-config';
import { resolveGrammarHighlightingEnabled } from './rubric-category-options';

const partiallyFilledRubric = {
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
};

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
      gradingPromptConfigJson: {
        systemInstructions: 'Act as a careful assignment-specific evaluator.',
        gradingInstructions: 'Grade against this rubric.',
      },
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
    expect(config.promptConfig.gradingInstructions).toBe(
      'Grade against this rubric.'
    );
    expect(config.promptConfig.systemInstructions).toBe(
      'Act as a careful assignment-specific evaluator.'
    );
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
    expect(config.promptConfig.instructionsPreset).toBe(
      'legacy_thesis_driven_essay'
    );
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

  test('still owns a partially-filled rubric, so reading never moves it to the thesis default', () => {
    // Reading is permissive on purpose: a rubric an admin already saved keeps
    // grading against itself. The incompleteness is surfaced loudly elsewhere
    // (the save-time block and the grading-time banner) rather than silently
    // swapping the rubric out from under existing scores.
    expect(hasAssignmentTypeOwnedRubric(partiallyFilledRubric)).toBe(true);
    expect(isRubricFullyPopulated(partiallyFilledRubric)).toBe(false);
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

describe('classifyAssignmentTypeRubric', () => {
  test('reports none when there is nothing an admin filled in', () => {
    expect(classifyAssignmentTypeRubric({ categories: [] })).toBe('none');
    expect(
      classifyAssignmentTypeRubric({
        categories: [{ key: '', label: '', description: '', weight: 0 }],
      })
    ).toBe('none');
  });

  test('reports partial when some categories are complete and others are not', () => {
    expect(classifyAssignmentTypeRubric(partiallyFilledRubric)).toBe('partial');
  });

  test('reports complete when every category is fully populated', () => {
    expect(
      classifyAssignmentTypeRubric({
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 1,
          },
        ],
      })
    ).toBe('complete');
  });
});

describe('a partially-filled rubric', () => {
  test('does not silently fall back to the thesis default', () => {
    const config = parseAssignmentTypeRubricConfig({
      rubricJson: partiallyFilledRubric,
    });

    expect(config.source).toBe('assignment-type');
    expect(config.rubric.categories.map((category) => category.key)).toEqual([
      'claim',
      'evidence',
    ]);
  });

  test('is flagged incomplete so the teacher-facing banner can fire', () => {
    const config = parseAssignmentTypeRubricConfig({
      rubricJson: partiallyFilledRubric,
    });

    expect(config.rubricIncomplete).toBe(true);
  });

  test('a fully populated rubric is not flagged incomplete', () => {
    const config = parseAssignmentTypeRubricConfig({
      rubricJson: {
        categories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear defensible claim.',
            weight: 1,
          },
        ],
      },
    });

    expect(config.source).toBe('assignment-type');
    expect(config.rubricIncomplete).toBe(false);
  });

  test('a default rubric is not flagged incomplete', () => {
    expect(parseAssignmentTypeRubricConfig({}).rubricIncomplete).toBe(false);
    expect(
      parseAssignmentTypeRubricConfig({ assignmentTypeKind: 'daily_pages' })
        .rubricIncomplete
    ).toBe(false);
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

describe('customizable rubric category options', () => {
  const customRubric = {
    categories: [
      {
        key: 'daily_habit',
        label: 'Daily Habit',
        weight: 0.5,
        description: 'Did the student write today?',
        scoreLabels: [
          { value: 1, label: 'Skipped' },
          { value: 5, label: 'Every day' },
        ],
        feedbackEnabled: false,
        grammarHighlighting: false,
      },
      {
        key: 'reflection',
        label: 'Reflection',
        weight: 0.5,
        description: 'Depth of reflection.',
      },
    ],
  };

  test('parseAssignmentTypeRubricConfig preserves the new optional category fields', () => {
    const config = parseAssignmentTypeRubricConfig({ rubricJson: customRubric });

    expect(config.source).toBe('assignment-type');
    expect(config.rubric.categories[0].scoreLabels).toEqual([
      { value: 1, label: 'Skipped' },
      { value: 5, label: 'Every day' },
    ]);
    expect(config.rubric.categories[0].feedbackEnabled).toBe(false);
    expect(config.rubric.categories[0].grammarHighlighting).toBe(false);
  });

  test('categories that omit the new fields leave them undefined', () => {
    const config = parseAssignmentTypeRubricConfig({ rubricJson: customRubric });

    expect(config.rubric.categories[1].scoreLabels).toBeUndefined();
    expect(config.rubric.categories[1].feedbackEnabled).toBeUndefined();
    expect(config.rubric.categories[1].grammarHighlighting).toBeUndefined();
  });

  test('the new fields do not affect whether a rubric counts as assignment-type owned', () => {
    expect(hasAssignmentTypeOwnedRubric(customRubric)).toBe(true);
  });

  test('the thesis default rubric is unchanged and carries no new fields', () => {
    const thesis = getThesisDefaultRubricConfig();

    expect(thesis.source).toBe('thesis-default');
    for (const category of thesis.rubric.categories) {
      expect(category.scoreLabels).toBeUndefined();
      expect(category.feedbackEnabled).toBeUndefined();
      expect(category.grammarHighlighting).toBeUndefined();
    }
  });

  test('malformed new-field values are dropped instead of persisted', () => {
    const config = parseAssignmentTypeRubricConfig({
      rubricJson: {
        categories: [
          {
            key: 'a',
            label: 'A',
            weight: 1,
            description: 'd',
            scoreLabels: 'nope',
            feedbackEnabled: 'yes',
            grammarHighlighting: 1,
          },
        ],
      },
    });

    expect(config.rubric.categories[0].scoreLabels).toBeUndefined();
    expect(config.rubric.categories[0].feedbackEnabled).toBeUndefined();
    expect(config.rubric.categories[0].grammarHighlighting).toBeUndefined();
  });
});

describe('the default rubric config for a Class Starter assignment type', () => {
  test('falls back to the Class Starter engagement rubric', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
    });

    expect(config.source).toBe('class-starter-default');
    expect(config.rubric.categories.map((category) => category.key)).toEqual([
      'engagement',
    ]);
    expect(config.scoringScale).toMatchObject({ minScore: 0, maxScore: 3 });
    expect(config.defaultLabel).toBe('Class Starter engagement');
  });

  test('a Class Starter type with its own saved rubric keeps that rubric', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
      rubricJson: {
        categories: [
          {
            key: 'effort',
            label: 'Effort',
            description: 'Did they try?',
            weight: 1,
          },
        ],
      },
    });

    expect(config.source).toBe('assignment-type');
  });
});

describe('the default rubric config for a Daily Pages assignment type', () => {
  /**
   * Daily Pages is the graded assignment now — there is no flag and no legacy
   * path. A `daily_pages` type that saved no rubric of its own grades on the
   * short-form rubric, which is a real change for every such row: a 1-5 scale
   * with grammar marked, where the old default judged engagement alone.
   */
  test('grades on the short-form rubric, unconditionally', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'daily_pages',
    });

    expect(config.source).toBe('daily-pages-short-form-default');
    expect(config.rubric.categories).toHaveLength(5);
    expect(config.scoringScale).toMatchObject({ minScore: 1, maxScore: 5 });
    expect(config.defaultLabel).toBe('Daily Pages short-form writing');
  });

  test('marks grammar, which the Class Starter default never does', () => {
    const dailyPages = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'daily_pages',
    });
    const classStarter = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
    });

    expect(resolveGrammarHighlightingEnabled(dailyPages.rubric.categories)).toBe(
      true
    );
    expect(
      resolveGrammarHighlightingEnabled(classStarter.rubric.categories)
    ).toBe(false);
  });

  /**
   * The one thing that still protects a customer: a type that configured its
   * own rubric keeps it. Production's Daily Pages row scores engagement out of
   * thirty and is untouched by this change.
   */
  test('a Daily Pages type with its own saved rubric is untouched', () => {
    const config = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'daily_pages',
      rubricJson: {
        categories: [
          {
            key: 'engagement_with_prompt',
            label: 'Engagement with Prompt',
            description: 'Production scores this out of thirty.',
            weight: 1,
          },
        ],
      },
    });

    expect(config.source).toBe('assignment-type');
    expect(config.rubric.categories.map((category) => category.key)).toEqual([
      'engagement_with_prompt',
    ]);
  });

  test('the two assistants are different objects, not the same one renamed', () => {
    const classStarter = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'class_starter',
    });
    const dailyPages = parseAssignmentTypeRubricConfig({
      assignmentTypeKind: 'daily_pages',
    });

    expect(dailyPages.promptConfig.gradingInstructions).not.toBe(
      classStarter.promptConfig.gradingInstructions
    );
    expect(dailyPages.rubric.categories.length).toBeGreaterThan(
      classStarter.rubric.categories.length
    );
  });
});
