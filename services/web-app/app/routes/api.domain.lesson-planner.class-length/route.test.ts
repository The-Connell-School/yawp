import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const prisma = { class: { updateMany: mock() } };

mock.module('~/utils/auth.server', () => ({
  requireMutableRequest,
  requireUserId: mock(),
  requireMembership: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({
  requireLessonPlannerAccess,
}));

const { action } = await import('./route');

afterAll(() => {
  mock.restore();
});

function formRequest(fields: Record<string, string>) {
  return new Request('http://localhost/api/domain/lesson-planner/class-length', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });
}

beforeEach(() => {
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue({
    membership: { id: 'teacher-1', organization: { id: 'org-1' } },
    allowed: true,
  });
  prisma.class.updateMany.mockReset().mockResolvedValue({ count: 1 });
});

describe("remembering how long a class meets (Brian's review, A2)", () => {
  test('saves the length on a class this teacher teaches', async () => {
    const response = await action({
      request: formRequest({ classId: 'class-1', minutes: '90' }),
    } as any);
    expect(prisma.class.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'class-1', teachers: { some: { id: 'teacher-1' } } },
      data: { periodMinutes: 90 },
    });
    expect((response as any).data.saved).toBe(true);
  });

  test('404s on a class that is not theirs', async () => {
    prisma.class.updateMany.mockResolvedValue({ count: 0 });
    const response = await action({
      request: formRequest({ classId: 'other', minutes: '50' }),
    } as any);
    expect((response as any).init?.status).toBe(404);
  });

  test('rejects a length off the slider', async () => {
    await action({ request: formRequest({ classId: 'class-1', minutes: '400' }) } as any);
    await action({ request: formRequest({ classId: 'class-1', minutes: 'soon' }) } as any);
    expect(prisma.class.updateMany).not.toHaveBeenCalled();
  });
});
