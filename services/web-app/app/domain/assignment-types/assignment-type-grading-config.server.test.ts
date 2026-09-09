import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { resolveAssignmentTypeGradingConfig } =
  await import('./assignment-type-grading-config.server');

describe('resolveAssignmentTypeGradingConfig', () => {
  beforeEach(() => {
    prisma.assignmentType.findUnique.mockReset();
  });

  test('selected library rubric drives the compiled grading invocation instead of stale inline configuration', async () => {
    const { STARTER_RUBRICS, DAILY_PAGES_RUBRIC_NAME } = await import('~/domain/rubrics/starter-rubrics');
    const { compileGradingAssistantInvocation } = await import('~/domain/grading/grading-assistant-invocation');
    const schema = STARTER_RUBRICS.find(rubric => rubric.name === DAILY_PAGES_RUBRIC_NAME)!;
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'selected-library', title: 'Journal', kind: null,
      rubric: { name: schema.name, schemaJson: schema },
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: { categories: [{ key: 'obsolete', label: 'Obsolete criterion', description: 'Do not use this.', weight: 1 }] },
      gradingPromptConfigJson: { gradingInstructions: 'Obsolete instructions', gradingInstructionsOverride: 'Focus on personal reflection.' },
      gradingAssistantVersion: 2,
    });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'selected-library' });
    expect(config.minScore).toBe(0);
    expect(config.maxScore).toBe(30);
    expect(config.step).toBe(10);
    expect(config.rubricCategories.map(category => category.key)).toEqual(['engagement_with_prompt']);
    const invocation = compileGradingAssistantInvocation({ gradingConfig: config, studentFirstName: 'Jordan', strictnessLevel: 'intermediate', documentText: 'Synthetic reflection.' });
    const prompt = invocation.system + invocation.userMessage;
    expect(prompt).toContain('Engagement with Prompt');
    expect(prompt).toContain('Focus on personal reflection.');
    expect(prompt).not.toContain('Obsolete criterion');
    expect(prompt).not.toContain('Obsolete instructions');
  });

  test.each(['daily-pages-engagement', 'thesis-driven-essay'])('selected %s library rubric preserves promoted prompt templates', async (name) => {
    const { STARTER_RUBRICS } = await import('~/domain/rubrics/starter-rubrics');
    const { compileGradingAssistantInvocation } = await import('~/domain/grading/grading-assistant-invocation');
    const schema = STARTER_RUBRICS.find(rubric => rubric.name === name)!;
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'managed-library', title: 'Managed journal', kind: null,
      rubric: { name: schema.name, schemaJson: schema },
      rubricJson: null, scoringScaleJson: null,
      gradingPromptConfigJson: {
        systemMessageTemplate: 'Promoted system {{grading_instructions}}',
        userMessageTemplate: 'Promoted rubric {{rubric}} Document {{document}}',
        gradingInstructionsOverride: 'Preserved override.',
      },
      gradingAssistantVersion: 3,
    });
    const config = await resolveAssignmentTypeGradingConfig({ assignmentTypeId: 'managed-library' });
    expect(config.promptTemplate).toEqual({ systemMessage: 'Promoted system {{grading_instructions}}', userMessage: 'Promoted rubric {{rubric}} Document {{document}}' });
    expect(config.maxScore).toBe(name === 'daily-pages-engagement' ? 30 : 5);
    const invocation = compileGradingAssistantInvocation({ gradingConfig: config, studentFirstName: 'Jordan', strictnessLevel: 'intermediate', documentText: 'Synthetic essay.' });
    expect(invocation.system).toContain('Promoted system');
    expect(invocation.system).toContain('Preserved override.');
    expect(invocation.userMessage).toContain('Promoted rubric');
    expect(invocation.userMessage).toContain('Synthetic essay.');
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
        systemInstructions:
          'Act as a precise ACT Writing evaluator for this assignment type.',
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
      systemInstructions:
        'Act as a precise ACT Writing evaluator for this assignment type.',
      gradingInstructions: 'Grade this as ACT Writing.',
    });
    expect(config.rubricSnapshot).toEqual({
      categories: config.rubricCategories,
      minScore: 1,
      maxScore: 6,
      // Absent from the stored scale, so it falls back to every value.
      step: 1,
      scoringType: 'act_writing_2_12',
    });
    expect(config.promptConfigSnapshot).toEqual({
      systemInstructions:
        'Act as a precise ACT Writing evaluator for this assignment type.',
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
      rubric: null,
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

  test('uses the promoted prompt templates stored on the assignment type', async () => {
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-prompt',
      title: 'Prompt-managed essay',
      kind: 'essay',
      scoringScaleJson: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
      rubricJson: {
        categories: [
          {
            key: 'thesis',
            label: 'Thesis',
            description: 'Makes a clear claim.',
            weight: 1,
          },
        ],
      },
      gradingPromptConfigJson: {
        gradingInstructions: 'Grade the essay.',
        systemMessageTemplate: 'Production system for {{assignment_type}}',
        userMessageTemplate: 'Rubric:\n{{rubric}}\nEssay:\n{{document}}',
      },
      gradingOutputSchemaJson: { schemaVersion: 1 },
      gradingCalibrationNotes: null,
      gradingAssistantVersion: 7,
      gradingAssistantSourceTemplateId: null,
      gradingAssistantSourceTemplateSlug: null,
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-prompt',
    });

    expect(config.promptTemplate).toEqual({
      systemMessage: 'Production system for {{assignment_type}}',
      userMessage: 'Rubric:\n{{rubric}}\nEssay:\n{{document}}',
    });
  });

  test('selecting the canonical Thesis library entry preserves the exact production config identity', async () => {
    const { THESIS_DRIVEN_ESSAY } =
      await import('~/domain/rubrics/thesis-driven-essay');
    prisma.assignmentType.findUnique.mockResolvedValue({
      id: 'assignment-type-thesis',
      title: 'Thesis-driven Essay',
      kind: null,
      scoringScaleJson: {
        type: 'weighted_percent',
        minScore: 0,
        maxScore: 100,
      },
      rubricJson: { categories: [] },
      gradingPromptConfigJson: {
        gradingInstructions: 'Stale instructions from the retired rubric editor.',
        gradingInstructionsOverride:
          'Apply the thesis rubric with extra emphasis on source analysis.',
      },
      gradingOutputSchemaJson: null,
      gradingCalibrationNotes: 'Changed notes.',
      gradingAssistantVersion: 9,
      gradingAssistantSourceTemplateId: 'changed-template',
      gradingAssistantSourceTemplateSlug: 'changed-template',
      rubric: {
        name: 'thesis-driven-essay',
        schemaJson: THESIS_DRIVEN_ESSAY,
      },
    });

    const config = await resolveAssignmentTypeGradingConfig({
      assignmentTypeId: 'assignment-type-thesis',
    });

    expect(config.source).toBe('thesis-default');
    expect(config.label).toBe('Thesis-driven essay grading assistant');
    expect(config.version).toBe(1);
    expect(config.scoringType).toBe('weighted_1_5');
    expect(config.minScore).toBe(1);
    expect(config.maxScore).toBe(5);
    expect(config.instructions).toEqual({
      mode: 'unified',
      gradingInstructions:
        'Apply the thesis rubric with extra emphasis on source analysis.',
    });
    expect(config.promptConfigSnapshot).toEqual(
      expect.objectContaining({
        gradingInstructions:
          'Apply the thesis rubric with extra emphasis on source analysis.',
      })
    );
    expect(config.sourceTemplateId).toBeNull();
    expect(config.sourceTemplateSlug).toBeNull();
  });
});
