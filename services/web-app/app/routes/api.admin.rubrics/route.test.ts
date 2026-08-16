import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  rubric: { findUnique: mock() },
  assignmentType: { update: mock() },
};
const requireOwner = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireOwner, requireMembership }));

const { action } = await import('./route');

async function responseBody(response: unknown) {
  const typed = response as { json?: () => Promise<unknown>; data?: unknown };
  return typeof typed.json === 'function' ? typed.json() : typed.data;
}

function responseStatus(response: unknown) {
  const typed = response as { status?: number; init?: { status?: number } };
  return typed.status ?? typed.init?.status ?? 200;
}

function post(fields: Record<string, string>) {
  return action({
    request: new Request('https://example.test/api/admin/rubrics', {
      method: 'POST',
      body: new URLSearchParams(fields),
    }),
    params: {},
    context: {} as never,
  } as never);
}

describe('api.admin.rubrics', () => {
  beforeEach(() => {
    prisma.rubric.findUnique.mockReset();
    prisma.assignmentType.update.mockReset();
    requireOwner.mockReset();
    requireMembership.mockReset();
    requireOwner.mockResolvedValue({ id: 'owner-1' });
    requireMembership.mockResolvedValue(undefined);
  });

  test('selects an existing database rubric for an assignment type', async () => {
    prisma.rubric.findUnique.mockResolvedValue({ id: 'rubric-1' });
    prisma.assignmentType.update.mockResolvedValue({ id: 'type-1' });

    const response = await post({
      intent: 'select',
      assignmentTypeId: 'type-1',
      rubricId: 'rubric-1',
    });

    expect(responseStatus(response)).toBe(200);
    expect(await responseBody(response)).toEqual({
      status: 'success',
      rubricId: 'rubric-1',
    });
    expect(prisma.assignmentType.update).toHaveBeenCalledWith({
      where: { id: 'type-1' },
      data: { rubricId: 'rubric-1' },
    });
  });

  test('does not accept rubric creation through the view-only admin API', async () => {
    const response = await post({
      intent: 'create',
      schemaJson: JSON.stringify({ name: 'replacement' }),
    });

    expect(responseStatus(response)).toBe(400);
    expect(await responseBody(response)).toEqual({ error: 'Unknown action.' });
    expect(prisma.rubric.findUnique).not.toHaveBeenCalled();
    expect(prisma.assignmentType.update).not.toHaveBeenCalled();
  });
});
