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
  return new Request('https://example.test/app/admin/grading-assistants/template-1', {
    method: 'POST',
    body: form,
  });
}

describe('edit grading assistant action', () => {
  beforeEach(() => {
    prisma.gradingAssistantTemplate.update.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({ id: 'profile-1' });
  });

  test('updates template fields and increments the template version', async () => {
    await action({
      request: postForm({
        name: 'Updated ACT Writing grader',
        rubricJson: JSON.stringify({ categories: [{ key: 'ideas' }] }),
        promptConfigJson: JSON.stringify({
          gradingInstructions: 'Updated grading guidance.',
        }),
        scoringScale: JSON.stringify({ type: 'act_writing_2_12' }),
      }),
      params: { id: 'template-1' },
    } as any);

    expect(prisma.gradingAssistantTemplate.update).toHaveBeenCalledWith({
      where: { id: 'template-1' },
      data: expect.objectContaining({
        name: 'Updated ACT Writing grader',
        rubricJson: { categories: [{ key: 'ideas' }] },
        promptConfigJson: { gradingInstructions: 'Updated grading guidance.' },
        scoringScale: { type: 'act_writing_2_12' },
        version: { increment: 1 },
        updatedByMembershipId: 'profile-1',
      }),
    });
    expect(
      prisma.gradingAssistantTemplate.update.mock.calls[0][0].data
    ).not.toHaveProperty('outputSchemaJson');
    expect(
      prisma.gradingAssistantTemplate.update.mock.calls[0][0].data
    ).not.toHaveProperty('calibrationNotes');
  });
});
