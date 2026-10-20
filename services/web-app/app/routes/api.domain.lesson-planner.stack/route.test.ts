import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const prisma = {
  lessonPlanConversation: { findFirst: mock(), update: mock() },
  lessonPlanMessage: { findFirst: mock() },
};
const loadStackV3 = mock();
const actions = {
  addPiecesAt: mock(),
  classKeyFor: mock(() => 'label:english 10'),
  moveStepToTomorrow: mock(),
  restoreStackSnapshot: mock(),
  setStepMinutes: mock(),
};
const runStackCommand = mock();

mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));
mock.module('~/domain/lesson-planner/load-stack-v3.server', () => ({ loadStackV3 }));
mock.module('~/domain/lesson-planner/stack-actions.server', () => actions);
mock.module('~/domain/lesson-planner/stack-command.server', () => ({ runStackCommand }));

const { action } = await import('./route');

afterAll(() => mock.restore());

function post(fields: Record<string, string>) {
  return action({
    request: new Request('http://localhost/api/domain/lesson-planner/stack', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
    }),
  } as any) as Promise<any>;
}

const UNDO = { rows: [], order: ['m:a'], carryOverIds: [] };

beforeEach(() => {
  requireMutableRequest.mockReset().mockResolvedValue(undefined);
  requireLessonPlannerAccess.mockReset().mockResolvedValue({
    membership: { id: 'teacher-1', organization: { id: 'org-1' } },
  });
  getLessonPlannerReviewFlags.mockReset().mockResolvedValue({ stackV3: true });
  prisma.lessonPlanConversation.findFirst.mockReset().mockResolvedValue({
    id: 'plan-1',
    membershipId: 'teacher-1',
    organizationId: 'org-1',
    lessonClassLabel: 'English 10',
    lessonDate: null,
    periodMinutes: 50,
    originClassAssignment: null,
  });
  prisma.lessonPlanConversation.update.mockReset().mockResolvedValue({});
  for (const fn of Object.values(actions)) fn.mockReset();
  actions.classKeyFor.mockReturnValue('label:english 10');
  loadStackV3.mockReset();
  runStackCommand.mockReset();
});

describe('stack page actions (stack page redesign)', () => {
  test('nothing without the flag', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: false });
    const response = await post({ intent: 'set-lesson', conversationId: 'plan-1' });
    expect(response.init.status).toBe(404);
  });

  test("another teacher's lesson is not found", async () => {
    prisma.lessonPlanConversation.findFirst.mockResolvedValue(null);
    const response = await post({ intent: 'set-lesson', conversationId: 'plan-x' });
    expect(response.init.status).toBe(404);
  });

  test('the stepper sets a step’s minutes and hands back Undo', async () => {
    actions.setStepMinutes.mockResolvedValue(UNDO);
    const response = await post({ intent: 'set-minutes', conversationId: 'plan-1', materialId: 'hook', minutes: '10' });
    expect(actions.setStepMinutes).toHaveBeenCalledWith('plan-1', 'hook', 10);
    expect(response.data).toEqual({ ok: true, undo: UNDO });
  });

  test('a fix is worked out again on the server; a stale one is refused', async () => {
    loadStackV3.mockResolvedValue({ v3: { fixes: [] } });
    const stale = await post({ intent: 'apply-fix', conversationId: 'plan-1', fix: 'trim' });
    expect(stale.init.status).toBe(409);

    loadStackV3.mockResolvedValue({
      v3: { fixes: [{ id: 'tomorrow', stepId: 'hist', leaves: 0, text: '' }] },
    });
    actions.moveStepToTomorrow.mockResolvedValue({ ...UNDO, carryOverIds: ['c1'] });
    const moved = await post({ intent: 'apply-fix', conversationId: 'plan-1', fix: 'tomorrow' });
    expect(actions.moveStepToTomorrow.mock.calls[0][0]).toMatchObject({
      materialId: 'hist',
      conversation: { id: 'plan-1', classKey: 'label:english 10' },
    });
    expect(moved.data.fix).toBe('tomorrow');
  });

  test('set and keep editing', async () => {
    await post({ intent: 'set-lesson', conversationId: 'plan-1' });
    expect(prisma.lessonPlanConversation.update.mock.calls[0][0].data.setAt).toBeInstanceOf(Date);
    await post({ intent: 'unset-lesson', conversationId: 'plan-1' });
    expect(prisma.lessonPlanConversation.update.mock.calls[1][0].data.setAt).toBeNull();
  });

  test('undo restores a snapshot, and refuses junk', async () => {
    actions.restoreStackSnapshot.mockResolvedValue(true);
    const ok = await post({ intent: 'undo', conversationId: 'plan-1', snapshot: JSON.stringify(UNDO) });
    expect(ok.data).toEqual({ ok: true });
    const junk = await post({ intent: 'undo', conversationId: 'plan-1', snapshot: 'nope' });
    expect(junk.init.status).toBe(400);
  });

  test('a piece goes in where the teacher pointed', async () => {
    prisma.lessonPlanMessage.findFirst.mockResolvedValue({ id: 'msg-1', createdAt: new Date(), content: 'x' });
    actions.addPiecesAt.mockResolvedValue({ added: ['msg-1:st:1'], keys: ['m:new'] });
    const response = await post({
      intent: 'add-piece',
      conversationId: 'plan-1',
      messageId: 'msg-1',
      materialKeys: 'st:1',
      beforeKey: 'm:hist',
    });
    expect(actions.addPiecesAt.mock.calls[0][0]).toMatchObject({ keys: ['st:1'], beforeKey: 'm:hist' });
    expect(response.data.keys).toEqual(['m:new']);
  });
});
