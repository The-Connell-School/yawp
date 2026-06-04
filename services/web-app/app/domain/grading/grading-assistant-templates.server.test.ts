import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentTypeGradingAssistant: {
    findFirst: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  LEGACY_THESIS_GRADING_ASSISTANT_TEMPLATE,
  resolveGradingAssistantTemplateForAssignmentType,
} = await import('./grading-assistant-templates.server');

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
