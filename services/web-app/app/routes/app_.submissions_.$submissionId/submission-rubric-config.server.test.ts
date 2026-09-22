import authored from '~/domain/rubrics/library/daily-pages-engagement.json';
import { afterAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import type { ResolvedAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';

const assignmentTypeGradingConfig = await import(
  '~/domain/assignment-types/assignment-type-grading-config.server'
);
const resolveAssignmentTypeGradingConfig = spyOn(
  assignmentTypeGradingConfig,
  'resolveAssignmentTypeGradingConfig'
);

function resolvedGradingConfig(
  overrides: Partial<ResolvedAssignmentTypeGradingConfig> = {}
) {
  return {
    source: 'assignment-type' as const,
    rubricIncomplete: false,
    assignmentTypeId: 'assignment-type-custom',
    assignmentTypeKind: null,
    assignmentTypeTitle: 'Custom assignment',
    label: 'Custom assignment',
    version: 1,
    scoringType: 'weighted_1_5',
    minScore: 1,
    maxScore: 5,
    step: 1,
    rubricCategories: [],
    instructions: {
      mode: 'legacy-split' as const,
      rubricInstructions: 'Use the configured rubric.',
      scoreInstructions: 'Use the configured score range.',
    },
    rubricSnapshot: {},
    promptConfigSnapshot: {},
    outputSchemaSnapshot: {},
    calibrationNotes: null,
    sourceTemplateId: null,
    sourceTemplateSlug: null,
    ...overrides,
  };
}

const { buildRubricConfigFromSnapshot, resolveRubricConfigForSubmission } =
  await import('./submission-rubric-config.server');

afterAll(() => {
  resolveAssignmentTypeGradingConfig.mockRestore();
});

describe('buildRubricConfigFromSnapshot — stepped scales', () => {
  const tieredSnapshot = {
    minScore: 0,
    maxScore: 30,
    scoringType: 'rubric_points',
    categories: [
      {
        key: 'engagement',
        label: 'Engagement',
        description: 'Willingness to put real thoughts on the page.',
        weight: 1,
        scoreLabels: [
          { value: 0, label: 'NOT HANDED IN' },
          { value: 10, label: 'HARDLY THERE' },
          { value: 20, label: 'SHOWED UP' },
          { value: 30, label: 'ALL IN' },
        ],
      },
    ],
  };

  // Snapshots written before scales carried a step still list their tiers, and
  // without this the teacher is offered all thirty-one values of a 0-30 scale.
  test('infers the step from the tiers when the snapshot predates steps', () => {
    expect(buildRubricConfigFromSnapshot(tieredSnapshot)?.step).toBe(10);
  });

  test('prefers a step the snapshot records', () => {
    expect(
      buildRubricConfigFromSnapshot({ ...tieredSnapshot, step: 5 })?.step
    ).toBe(5);
  });

  test('leaves an untiered snapshot stepping by one', () => {
    expect(
      buildRubricConfigFromSnapshot({
        ...tieredSnapshot,
        categories: [{ ...tieredSnapshot.categories[0], scoreLabels: [] }],
      })?.step
    ).toBe(1);
  });
});

describe('resolveRubricConfigForSubmission', () => {
  beforeEach(() => {
    resolveAssignmentTypeGradingConfig.mockReset();
  });

  test('prefers the latest grading run rubric snapshot', async () => {
    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-act',
      latestGradingRun: {
        assignmentTypeRubricSnapshot: {
          minScore: 1,
          maxScore: 6,
          scoringType: 'act_writing_2_12',
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description: 'Generate productive ideas and analyze perspectives.',
              weight: 0.25,
            },
          ],
        },
      },
      rubricScores: {
        ideas_and_analysis: { score: 5, comment: 'Clear analysis.' },
      },
    });

    expect(config).toEqual({
      minScore: 1,
      maxScore: 6,
      step: 1,
      scoringType: 'act_writing_2_12',
      categories: [
        {
          key: 'ideas_and_analysis',
          label: 'Ideas and Analysis',
          description: 'Generate productive ideas and analyze perspectives.',
          weight: 0.25,
        },
      ],
    });
    expect(resolveAssignmentTypeGradingConfig).not.toHaveBeenCalled();
  });

  test('falls back to current assignment type config when no run snapshot exists', async () => {
    resolveAssignmentTypeGradingConfig.mockResolvedValue(
      resolvedGradingConfig({
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        rubricCategories: [
          {
            key: 'claim',
            label: 'Claim',
            description: 'A clear claim.',
            weight: 1,
          },
        ],
      })
    );

    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-custom',
      latestGradingRun: null,
      rubricScores: {
        claim: { score: 4, comment: 'Clear claim.' },
      },
    });

    expect(config.categories.map((category) => category.key)).toEqual(['claim']);
    expect(config.source).toBe('assignment-type');
    expect(resolveAssignmentTypeGradingConfig).toHaveBeenCalledWith({
      assignmentTypeId: 'assignment-type-custom',
    });
  });

  test('marks the config as a thesis-default fallback when the live assignment type config falls back', async () => {
    resolveAssignmentTypeGradingConfig.mockResolvedValue(
      resolvedGradingConfig({
        source: 'thesis-default',
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        rubricCategories: [
          {
            key: 'thesis_and_content',
            label: 'Thesis/Content',
            description: 'Thesis quality.',
            weight: 0.25,
          },
        ],
      })
    );

    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-empty',
      latestGradingRun: null,
      rubricScores: {},
    });

    expect(config.source).toBe('thesis-default');
  });

  test('carries the source recorded on the latest grading run snapshot', async () => {
    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-act',
      latestGradingRun: {
        source: 'assignment-type',
        assignmentTypeRubricSnapshot: {
          minScore: 1,
          maxScore: 6,
          scoringType: 'act_writing_2_12',
          categories: [
            {
              key: 'ideas_and_analysis',
              label: 'Ideas and Analysis',
              description: 'Generate productive ideas and analyze perspectives.',
              weight: 0.25,
            },
          ],
        },
      },
      rubricScores: {
        ideas_and_analysis: { score: 5, comment: 'Clear analysis.' },
      },
    });

    expect(config.source).toBe('assignment-type');
  });

  test('uses legacy display config when old stored score keys do not match current config', async () => {
    resolveAssignmentTypeGradingConfig.mockResolvedValue(
      resolvedGradingConfig({
        minScore: 1,
        maxScore: 6,
        scoringType: 'act_writing_2_12',
        rubricCategories: [
          {
            key: 'ideas_and_analysis',
            label: 'Ideas and Analysis',
            description: 'Generate productive ideas and analyze perspectives.',
            weight: 0.25,
          },
        ],
      })
    );

    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-custom',
      latestGradingRun: null,
      rubricScores: {
        thesis_and_content: { score: 4, comment: 'Clear thesis.' },
        grammar_and_mechanics: { score: 3, comment: 'Some errors.' },
      },
    });

    expect(config.categories.map((category) => category.key)).toContain(
      'thesis_and_content'
    );
    expect(config.categories.map((category) => category.key)).toContain(
      'grammar_and_mechanics'
    );
  });

  test('carries the customizable category options through the snapshot round trip', async () => {
    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-daily-pages',
      latestGradingRun: {
        assignmentTypeRubricSnapshot: {
          minScore: 1,
          maxScore: 5,
          scoringType: 'weighted_1_5',
          categories: [
            {
              key: 'daily_habit',
              label: 'Daily Habit',
              description: 'Did the student write today?',
              weight: 1,
              scoreLabels: [
                { value: 1, label: 'Skipped' },
                { value: 5, label: 'Every day' },
              ],
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
        },
      },
      rubricScores: {
        daily_habit: { score: 5, comment: '' },
      },
    });

    expect(config.categories[0].scoreLabels).toEqual([
      { value: 1, label: 'Skipped' },
      { value: 5, label: 'Every day' },
    ]);
    expect(config.categories[0].feedbackEnabled).toBe(false);
    expect(config.categories[0].grammarHighlighting).toBe(false);
    expect(config.categories[0].bands).toEqual([
      {
        min: 0,
        max: 5,
        label: 'Raw points',
        description: 'Score this section out of five.',
      },
    ]);
  });
});

describe('a Daily Pages submission graded before Daily Pages had its own rubric', () => {
  const legacyThesisScores = {
    thesis_and_content: { score: 4, comment: 'Clear focus.' },
    organization_and_structure: { score: 3, comment: 'Reasonable order.' },
    evidence_and_support: { score: 3, comment: 'Some support.' },
    voice_and_style: { score: 4, comment: 'Honest voice.' },
    grammar_and_mechanics: { score: 3, comment: 'A few slips.' },
  };

  test('keeps rendering against the rubric it was actually graded on', async () => {
    // Live config is now the Daily Pages short-form rubric.
    resolveAssignmentTypeGradingConfig.mockResolvedValue(
      resolvedGradingConfig({
        source: 'daily-pages-short-form-default',
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        rubricCategories: [
          {
            key: 'depth_of_thought',
            label: 'Depth of Thought',
            description: 'How far past a first reaction the thinking goes.',
            weight: 0.35,
          },
          {
            key: 'grammar_and_mechanics',
            label: 'Grammar/Syntax/Mechanics',
            description: 'Sentence construction, punctuation, usage.',
            weight: 0.15,
          },
        ],
      })
    );

    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-daily-pages',
      latestGradingRun: {
        source: 'thesis-default',
        assignmentTypeRubricSnapshot: {
          minScore: 1,
          maxScore: 5,
          scoringType: 'weighted_1_5',
          categories: Object.keys(legacyThesisScores).map((key) => ({
            key,
            label: key,
            description: `Frozen ${key}.`,
            weight: 0.2,
          })),
        },
      },
      rubricScores: legacyThesisScores,
    });

    expect(config.source).toBe('thesis-default');
    expect(config.maxScore).toBe(5);
    expect(config.categories.map((category) => category.key)).toEqual(
      Object.keys(legacyThesisScores)
    );
  });

  test('falls back to the legacy rubric when there is no snapshot at all', async () => {
    resolveAssignmentTypeGradingConfig.mockResolvedValue(
      resolvedGradingConfig({
        source: 'daily-pages-short-form-default',
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        rubricCategories: [
          {
            key: 'depth_of_thought',
            label: 'Depth of Thought',
            description: 'How far past a first reaction the thinking goes.',
            weight: 0.35,
          },
          {
            key: 'grammar_and_mechanics',
            label: 'Grammar/Syntax/Mechanics',
            description: 'Sentence construction, punctuation, usage.',
            weight: 0.15,
          },
        ],
      })
    );

    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-daily-pages',
      latestGradingRun: null,
      rubricScores: legacyThesisScores,
    });

    // The stored keys are the legacy thesis ones, which the short-form rubric
    // cannot display, so the old scores stay readable on the old rubric.
    expect(config.categories.map((category) => category.key)).toEqual([
      'thesis_and_content',
      'organization_and_structure',
      'evidence_and_support',
      'voice_and_style',
      'grammar_and_mechanics',
    ]);
    expect(config.maxScore).toBe(5);
  });

  test('an ungraded Daily Pages submission picks up the short-form rubric', async () => {
    resolveAssignmentTypeGradingConfig.mockResolvedValue(
      resolvedGradingConfig({
        source: 'daily-pages-short-form-default',
        minScore: 1,
        maxScore: 5,
        scoringType: 'weighted_1_5',
        rubricCategories: [
          {
            key: 'depth_of_thought',
            label: 'Depth of Thought',
            description: 'How far past a first reaction the thinking goes.',
            weight: 0.35,
          },
          {
            key: 'grammar_and_mechanics',
            label: 'Grammar/Syntax/Mechanics',
            description: 'Sentence construction, punctuation, usage.',
            weight: 0.15,
          },
        ],
      })
    );

    const config = await resolveRubricConfigForSubmission({
      assignmentTypeId: 'assignment-type-daily-pages',
      latestGradingRun: null,
      rubricScores: {},
    });

    expect(config.source).toBe('daily-pages-short-form-default');
    expect(config.categories.map((category) => category.key)).toEqual([
      'depth_of_thought',
      'grammar_and_mechanics',
    ]);
    expect(config.minScore).toBe(1);
    expect(config.maxScore).toBe(5);
  });
});


describe('fresh Daily Pages display uses the assignment total', () => {
  function revisedConfig() {
    return resolvedGradingConfig({
      rubricName: authored.name, scoringType: 'rubric_points', minScore: 0, maxScore: 30,
      rubricCategories: structuredClone(authored.rubric.categories),
      outputSchemaSnapshot: authored.outputSchema,
    });
  }

  test.each([1, 2, 10, 90])('fresh %i-point display matches the GA bands and preserves pin identity', async (pointValue) => {
    const { scaleDailyPagesForAssignment } = await import('~/domain/assignment-types/daily-pages-assignment-points');
    const original = revisedConfig();
    resolveAssignmentTypeGradingConfig.mockResolvedValue(original);
    const config = await resolveRubricConfigForSubmission({ assignmentTypeId: 'daily', assignmentId: 'pinned-daily', pointValue, latestGradingRun: null, rubricScores: null });
    const ga = scaleDailyPagesForAssignment(original, pointValue);
    expect(config.maxScore).toBe(pointValue);
    expect(config.categories).toEqual(ga.rubricCategories);
    expect(resolveAssignmentTypeGradingConfig).toHaveBeenLastCalledWith({ assignmentTypeId: 'daily', assignmentId: 'pinned-daily' });
  });

  test('a historical run stays on its saved scale even when the current revision opts in', async () => {
    resolveAssignmentTypeGradingConfig.mockReset();
    const snapshot = { categories: authored.rubric.categories, minScore: 0, maxScore: 30, step: 1, scoringType: 'rubric_points' };
    const config = await resolveRubricConfigForSubmission({ assignmentTypeId: 'daily', pointValue: 90, latestGradingRun: { assignmentTypeRubricSnapshot: snapshot }, rubricScores: { engagement_with_prompt: { score: 18 } } });
    expect(config.maxScore).toBe(30);
    expect(config.categories).toEqual(snapshot.categories);
    expect(resolveAssignmentTypeGradingConfig).not.toHaveBeenCalled();
  });

  test('a fresh assignment pinned to a legacy revision stays on the authored scale', async () => {
    resolveAssignmentTypeGradingConfig.mockResolvedValue({ ...revisedConfig(), outputSchemaSnapshot: {} });
    const config = await resolveRubricConfigForSubmission({ assignmentTypeId: 'daily', assignmentId: 'legacy-pin', pointValue: 90, latestGradingRun: null, rubricScores: null });
    expect(config.maxScore).toBe(30);
  });
});
