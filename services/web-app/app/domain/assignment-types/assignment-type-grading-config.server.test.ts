import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { resolveAssignmentTypeGradingConfig } = await import(
  './assignment-type-grading-config.server'
);

describe('resolveAssignmentTypeGradingConfig', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
  });

  test('returns assignment-type-owned rubric and prompt config when present', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-act',
      title: 'ACT Writing',
      kind: 'act_writing',
      scoringScaleJson: { type: 'act_writing_2_12', minScore: 1, maxScore: 6 },
      rubricJson: {
        categories: [
          {
            key: 'ideas_and_analysis',
            label: 'Ideas and Analysis',
            description: 'Generate productive ideas and analyze perspectives.',
            weight: 0.25,
          },
          {
            key: 'language_use_and_conventions',
            label: 'Language Use and Conventions',
            description: 'Use language and conventions to support clarity.',
            weight: 0.25,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Grade this as ACT Writing.',
      },
      gradingOutputSchemaJson: { schemaVersion: 2 },
      gradingCalibrationNotes: 'Pilot notes.',
      gradingAssistantVersion: 4,
      gradingAssistantSourceTemplateId: 'template-act',
      gradingAssistantSourceTemplateSlug: 'act-writing-four-domain',
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-act',
    });

    expect(config.source).toBe('assignment-type');
    expect(config.label).toBe('ACT Writing');
    expect(config.version).toBe(4);
    expect(config.scoringType).toBe('act_writing_2_12');
    expect(config.minScore).toBe(1);
    expect(config.maxScore).toBe(6);
    expect(config.rubricCategories.map((category) => category.key)).toEqual([
      'ideas_and_analysis',
      'language_use_and_conventions',
    ]);
    expect(config.instructions).toEqual({
      mode: 'unified',
      gradingInstructions: 'Grade this as ACT Writing.',
    });
    expect(config.rubricSnapshot).toEqual({
      categories: config.rubricCategories,
      minScore: 1,
      maxScore: 6,
      scoringType: 'act_writing_2_12',
    });
    expect(config.promptConfigSnapshot).toEqual({
      gradingInstructions: 'Grade this as ACT Writing.',
    });
    expect(config.sourceTemplateSlug).toBe('act-writing-four-domain');
    expect(prisma.assignmentType.findUnique).toHaveBeenCalledWith({
      where: { id: 'assignment-type-act' },
      select: expect.objectContaining({
        rubricJson: true,
        gradingPromptConfigJson: true,
        gradingAssistantVersion: true,
      }),
    });
  });

  test('silently falls back to Thesis config when assignment type has no rubric', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-unlinked',
      title: 'Unlinked Assignment',
      kind: null,
      scoringScaleJson: null,
      rubricJson: null,
      gradingPromptConfigJson: null,
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 1,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-unlinked',
    });

    expect(config.source).toBe('thesis-default');
    expect(config.label).toBe('Thesis-driven essay grading assistant');
    expect(config.version).toBe(1);
    expect(
      config.rubricCategories.find(
        (category) => category.key === 'grammar_and_mechanics'
      )?.weight
    ).toBe(0.1);
    expect(config.instructions.mode).toBe('preset');
  });
});
