import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentTypeGradingAssistant: {
    findFirst: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE,
  getTemplateInstructions,
  resolveGradingAssistantTemplateForAssignmentType,
} = await import('./grading-assistant-templates.server');

const baseTemplate = {
  id: 'template-1',
  name: 'Test grader',
  slug: 'test-grader',
  status: 'active',
  version: 1,
  assignmentTypeKind: null,
  scoringScale: { type: 'weighted_1_5', minScore: 1, maxScore: 5 },
  rubricJson: { categories: [] },
  outputSchemaJson: { schemaVersion: 1 },
  calibrationNotes: null,
};

describe('resolveGradingAssistantTemplateForAssignmentType', () => {
  beforeEach(() => {
    prisma.assignmentTypeGradingAssistant.findFirst.mockReset();
  });

  test('returns the active default template linked to the assignment type id', async () => {
    prisma.assignmentTypeGradingAssistant.findFirst.mockResolvedValue({
      id: 'link-act',
      assignmentTypeId: 'assignment-type-act',
      gradingAssistantTemplateId: 'template-act',
      isDefault: true,
      activeFrom: new Date('2026-06-01T12:00:00.000Z'),
      activeTo: null,
      gradingAssistantTemplate: {
        id: 'template-act',
        name: 'ACT Writing four-domain grader',
        slug: 'act-writing-four-domain',
        status: 'active',
        version: 1,
        assignmentTypeKind: 'act_writing',
        scoringScale: { type: 'act_writing_2_12' },
        rubricJson: { categories: [] },
        promptConfigJson: { systemInstructions: 'Grade ACT writing.' },
        outputSchemaJson: { schemaVersion: 1 },
        calibrationNotes: 'Pilot template.',
      },
    });

    const result = await resolveGradingAssistantTemplateForAssignmentType({
      assignmentTypeId: 'assignment-type-act',
      assignmentTypeKind: 'act_writing',
      assignmentTypeTitle: 'Renamed ACT demo prompt',
      now: new Date('2026-06-04T12:00:00.000Z'),
    });

    expect(result.source).toBe('linked');
    expect(result.template?.slug).toBe('act-writing-four-domain');
    expect(result.template?.assignmentTypeKind).toBe('act_writing');
    expect(prisma.assignmentTypeGradingAssistant.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignmentTypeId: 'assignment-type-act',
          isDefault: true,
          activeFrom: { lte: expect.any(Date) },
          OR: [{ activeTo: null }, { activeTo: { gt: expect.any(Date) } }],
          gradingAssistantTemplate: { status: 'active' },
        }),
      })
    );
  });

  test('falls back to the legacy thesis-driven assistant when no link exists', async () => {
    prisma.assignmentTypeGradingAssistant.findFirst.mockResolvedValue(null);

    const result = await resolveGradingAssistantTemplateForAssignmentType({
      assignmentTypeId: 'assignment-type-daily-pages',
      assignmentTypeKind: 'daily_pages',
      assignmentTypeTitle: 'Daily Pages',
      now: new Date('2026-06-04T12:00:00.000Z'),
    });

    expect(result.source).toBe('legacy-fallback');
    expect(result.template).toEqual(LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE);
  });
});

describe('getTemplateInstructions', () => {
  test('returns built-in preset instructions for legacy thesis templates', () => {
    const instructions = getTemplateInstructions({
      ...baseTemplate,
      promptConfigJson: { instructionsPreset: 'legacy_thesis_driven_essay' },
    });

    expect(instructions.mode).toBe('preset');
    if (instructions.mode === 'preset') {
      expect(instructions.rubricInstructions).toContain('Philosophy Note');
      expect(instructions.scoreInstructions).toContain('Score mapping');
    }
  });

  test('prefers unified gradingInstructions over legacy preset and split fields', () => {
    const instructions = getTemplateInstructions({
      ...baseTemplate,
      promptConfigJson: {
        gradingInstructions: 'Grade with a generous voice-first lens.',
        instructionsPreset: 'legacy_thesis_driven_essay',
        systemInstructions: 'Ignore me.',
        scoreInstructions: 'Ignore me too.',
        rubricInstructions: 'Also ignore me.',
      },
    });

    expect(instructions).toEqual({
      mode: 'unified',
      gradingInstructions: 'Grade with a generous voice-first lens.',
    });
  });

  test('falls back to legacy split fields when gradingInstructions is absent', () => {
    const instructions = getTemplateInstructions({
      ...baseTemplate,
      promptConfigJson: {
        systemInstructions: 'Grade ACT Writing.',
        scoreInstructions: 'Use integers 1-6.',
      },
    });

    expect(instructions).toEqual({
      mode: 'legacy-split',
      rubricInstructions:
        'Use the rubric language, proficiency bands, and category weights from the user prompt exactly.',
      scoreInstructions: 'Use integers 1-6.',
      systemInstructions: 'Grade ACT Writing.',
    });
  });
});
