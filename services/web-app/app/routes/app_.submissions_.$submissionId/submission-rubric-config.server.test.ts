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
    assignmentTypeId: 'assignment-type-custom',
    assignmentTypeKind: null,
    assignmentTypeTitle: 'Custom assignment',
    label: 'Custom assignment',
    version: 1,
    scoringType: 'weighted_1_5',
    minScore: 1,
    maxScore: 5,
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

const { resolveRubricConfigForSubmission } = await import(
  './submission-rubric-config.server'
);

afterAll(() => {
  resolveAssignmentTypeGradingConfig.mockRestore();
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
});
