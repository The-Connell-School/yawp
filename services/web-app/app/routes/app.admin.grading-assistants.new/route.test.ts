import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $transaction: mock(),
  gradingAssistantTemplate: {
    create: mock(),
  },
  assignmentTypeGradingAssistant: {
    create: mock(),
  },
  assignmentType: {
    findMany: mock(),
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
  return new Request('https://example.test/app/admin/grading-assistants/new', {
    method: 'POST',
    body: form,
  });
}

describe('new grading assistant action', () => {
  beforeEach(() => {
    prisma.$transaction.mockReset();
    prisma.gradingAssistantTemplate.create.mockReset();
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

  test('creates a draft template and redirects to the edit page', async () => {
    prisma.gradingAssistantTemplate.create.mockResolvedValue({ id: 'template-1' });

    const response = await action({
      request: postForm({
        name: 'ACT Writing four-domain grader',
        rubricJson: JSON.stringify({ categories: [] }),
        promptConfigJson: JSON.stringify({
          gradingInstructions: 'Grade ACT writing with four domains.',
        }),
        scoringScale: JSON.stringify({ type: 'act_writing_2_12' }),
      }),
      params: {},
    } as any);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe(
      '/app/admin/grading-assistants/template-1'
    );
    expect(prisma.gradingAssistantTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'ACT Writing four-domain grader',
        status: 'draft',
        promptConfigJson: {
          gradingInstructions: 'Grade ACT writing with four domains.',
        },
        calibrationNotes: null,
      }),
    });
  });

  test('records a draft assignment-type default link without retiring the current runtime default', async () => {
    prisma.gradingAssistantTemplate.create.mockResolvedValue({ id: 'template-1' });

    await action({
      request: postForm({
        name: 'Daily Pages completion assistant',
        defaultAssignmentTypeId: 'assignment-type-1',
        rubricJson: JSON.stringify({ categories: [] }),
        promptConfigJson: JSON.stringify({
          gradingInstructions: 'Check completion.',
        }),
        scoringScale: JSON.stringify({ type: 'completion' }),
      }),
      params: {},
    } as any);

    expect(prisma.assignmentTypeGradingAssistant.create).toHaveBeenCalledWith({
      data: {
        assignmentTypeId: 'assignment-type-1',
        gradingAssistantTemplateId: 'template-1',
        isDefault: true,
        activeFrom: expect.any(Date),
      },
    });
  });
});
