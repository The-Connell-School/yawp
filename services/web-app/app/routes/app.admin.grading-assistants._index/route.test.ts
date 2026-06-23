import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  gradingAssistantTemplate: {
    update: mock(),
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

describe('admin grading assistant templates index action', () => {
  beforeEach(() => {
    prisma.gradingAssistantTemplate.update.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
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
