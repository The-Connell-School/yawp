import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  gradingAssistantTemplate: {
    create: mock(),
    update: mock(),
  },
};

const requireAdmin = mock();
const requireUserId = mock();
const requireProfile = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId,
  requireProfile,
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
    prisma.gradingAssistantTemplate.create.mockReset();
    prisma.gradingAssistantTemplate.update.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'profile-1' });
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
});
