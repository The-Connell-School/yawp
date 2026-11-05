import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const prisma = { lessonPlanConversation: { findFirst: mock(), updateMany: mock() } };

mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));

const { action } = await import('./route');
afterAll(() => mock.restore());

type Result = { init?: { status: number }; data?: Record<string, unknown> };
function report(fields: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return action({
    request: new Request('http://localhost/api/domain/lesson-planner/active-time', { method: 'POST', body: form }),
  } as never) as Promise<Result>;
}

describe('api.domain.lesson-planner.active-time', () => {
  beforeEach(() => {
    requireMutableRequest.mockReset().mockResolvedValue(undefined);
    requireLessonPlannerAccess.mockReset().mockResolvedValue({ membership: { id: 'teacher-1', organization: { id: 'org-1' } } });
    getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ activeTime: true });
    prisma.lessonPlanConversation.findFirst.mockReset().mockResolvedValue({ activeSince: null, activeReportedAt: null });
    prisma.lessonPlanConversation.updateMany.mockReset().mockResolvedValue({ count: 1 });
  });

  test('adds the seconds to the teacher’s own lesson that is not set yet, and starts its clock', async () => {
    const result = await report({ conversationId: 'lesson-1', seconds: '30' });
    expect(result.data).toEqual({ ok: true, credited: 30 });
    expect(prisma.lessonPlanConversation.findFirst.mock.calls[0]?.[0].where).toEqual({
      id: 'lesson-1',
      membershipId: 'teacher-1',
      deletedAt: null,
      setAt: null,
    });
    const update = prisma.lessonPlanConversation.updateMany.mock.calls[0]?.[0];
    expect(update.where).toEqual({ id: 'lesson-1', membershipId: 'teacher-1', deletedAt: null, setAt: null, activeReportedAt: null });
    expect(update.data.activeSeconds).toEqual({ increment: 30 });
    expect(update.data.activeSince).toBeInstanceOf(Date);
    expect(update.data.activeReportedAt).toBeInstanceOf(Date);
  });

  test('never credits more than the time since the last report', async () => {
    const last = new Date(Date.now() - 10_000);
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({ activeSince: new Date(Date.now() - 60_000), activeReportedAt: last });
    const result = await report({ conversationId: 'lesson-1', seconds: '120' });
    expect(result.data?.credited).toBe(15);
    const update = prisma.lessonPlanConversation.updateMany.mock.calls[0]?.[0];
    // Only if no other report landed in between.
    expect(update.where.activeReportedAt).toEqual(last);
    expect(update.data.activeSince).toBeUndefined();
  });

  test('a lesson that is set, deleted or someone else’s takes nothing', async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    const result = await report({ conversationId: 'lesson-2', seconds: '30' });
    expect(result.data).toEqual({ ok: true, credited: 0 });
    expect(prisma.lessonPlanConversation.updateMany).not.toHaveBeenCalled();
  });

  test('nothing to add, nothing written', async () => {
    expect((await report({ conversationId: 'lesson-1', seconds: '0' })).data?.credited).toBe(0);
    expect((await report({ conversationId: 'lesson-1', seconds: 'lots' })).data?.credited).toBe(0);
    expect(prisma.lessonPlanConversation.updateMany).not.toHaveBeenCalled();
  });

  test('flag off: not found, and nothing counted', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ activeTime: false });
    expect((await report({ conversationId: 'lesson-1', seconds: '30' })).init?.status).toBe(404);
    expect(prisma.lessonPlanConversation.updateMany).not.toHaveBeenCalled();
  });

  test('which lesson?', async () => {
    expect((await report({ seconds: '30' })).init?.status).toBe(400);
  });
});
