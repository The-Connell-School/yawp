import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  gradingAssistantTemplate: {
    create: mock(),
    update: mock(),
  },
  assignmentTypeGradingAssistant: {
    updateMany: mock(),
    create: mock(),
  },
};

const requireAdmin = mock();
const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId,
  requireMembership,
}));

const { action } = await import('./route');

function postForm(body: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.set(key, value);
  return new Request('https://example.test/app/admin/grading-assistants', {
    method: 'POST',
    body: form,
  });
}

describe('admin grading assistant templates action', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.gradingAssistantTemplate.create.mockReset();
    prisma.gradingAssistantTemplate.update.mockReset();
    prisma.assignmentTypeGradingAssistant.updateMany.mockReset();
    prisma.assignmentTypeGradingAssistant.create.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma)
    );
  });

  test('creates a draft template from JSON rubric and prompt config', async () => {
    prisma.gradingAssistantTemplate.create.mockResolvedValue({ id: 'template-1' });

    await action({
      request: postForm({
        intent: 'createTemplate',
        name: 'ACT Writing four-domain grader',
        slug: 'act-writing-four-domain',
        assignmentTypeKind: 'act_writing',
        rubricJson: JSON.stringify({ categories: [] }),
        promptConfigJson: JSON.stringify({ systemInstructions: 'Grade ACT.' }),
        scoringScale: JSON.stringify({ type: 'act_writing_2_12' }),
        outputSchemaJson: JSON.stringify({ schemaVersion: 1 }),
        calibrationNotes: 'Pilot calibration pending.',
      }),
      params: {},
    } as any);

    expect(prisma.gradingAssistantTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'ACT Writing four-domain grader',
        slug: 'act-writing-four-domain',
        status: 'draft',
        version: 1,
        assignmentTypeKind: 'act_writing',
        rubricJson: { categories: [] },
        promptConfigJson: { systemInstructions: 'Grade ACT.' },
        scoringScale: { type: 'act_writing_2_12' },
        outputSchemaJson: { schemaVersion: 1 },
        calibrationNotes: 'Pilot calibration pending.',
      }),
    });
  });

  test('creates a default assignment-type link while creating a draft template', async () => {
    prisma.gradingAssistantTemplate.create.mockResolvedValue({ id: 'template-1' });

    await action({
      request: postForm({
        intent: 'createTemplate',
        name: 'Daily Pages completion assistant',
        slug: 'daily-pages-completion',
        assignmentTypeKind: 'daily_pages',
        defaultAssignmentTypeId: 'assignment-type-1',
        rubricJson: JSON.stringify({ categories: [] }),
        promptConfigJson: JSON.stringify({
          systemInstructions: 'Check completion.',
        }),
        scoringScale: JSON.stringify({ type: 'completion' }),
        outputSchemaJson: JSON.stringify({ schemaVersion: 1 }),
        calibrationNotes: '',
      }),
      params: {},
    } as any);

    expect(prisma.gradingAssistantTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Daily Pages completion assistant',
        slug: 'daily-pages-completion',
      }),
    });
    expect(prisma.assignmentTypeGradingAssistant.updateMany).toHaveBeenCalledWith({
      where: {
        assignmentTypeId: 'assignment-type-1',
        isDefault: true,
        activeTo: null,
      },
      data: { activeTo: expect.any(Date) },
    });
    expect(prisma.assignmentTypeGradingAssistant.create).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'assignment-type-1',
        gradingAssistantTemplateId: 'template-1',
        isDefault: true,
        activeFrom: expect.any(Date),
      },
    });
  });

  test('publishes and archives templates without deleting them', async () => {
    await action({
      request: postForm({
        intent: 'setStatus',
        templateId: 'template-1',
        status: 'active',
      }),
      params: {},
    } as any);
    await action({
      request: postForm({
        intent: 'setStatus',
        templateId: 'template-1',
        status: 'archived',
      }),
      params: {},
    } as any);

    expect(prisma.gradingAssistantTemplate.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'template-1' },
      data: expect.objectContaining({ status: 'active' }),
    });
    expect(prisma.gradingAssistantTemplate.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'template-1' },
      data: expect.objectContaining({ status: 'archived' }),
    });
  });

  test('updates template fields and increments the template version', async () => {
    await action({
      request: postForm({
        intent: 'updateTemplate',
        templateId: 'template-1',
        name: 'Updated ACT Writing grader',
        slug: 'updated-act-writing',
        assignmentTypeKind: 'act_writing',
        rubricJson: JSON.stringify({ categories: [{ key: 'ideas' }] }),
        promptConfigJson: JSON.stringify({ systemInstructions: 'Updated.' }),
        scoringScale: JSON.stringify({ type: 'act_writing_2_12' }),
        outputSchemaJson: JSON.stringify({ schemaVersion: 2 }),
        calibrationNotes: 'Updated calibration.',
      }),
      params: {},
    } as any);

    expect(prisma.gradingAssistantTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: expect.objectContaining({
        name: 'Updated ACT Writing grader',
        slug: 'updated-act-writing',
        assignmentTypeKind: 'act_writing',
        rubricJson: { categories: [{ key: 'ideas' }] },
        promptConfigJson: { systemInstructions: 'Updated.' },
        scoringScale: { type: 'act_writing_2_12' },
        outputSchemaJson: { schemaVersion: 2 },
        calibrationNotes: 'Updated calibration.',
        version: { increment: 1 },
        updatedByMembershipId: 'profile-1',
      }),
    });
  });
});
