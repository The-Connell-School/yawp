import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireMutableRequest = mock();
const requireLessonPlannerAccess = mock();
const getLessonPlannerReviewFlags = mock();
const prisma = {
  lessonPlanConversation: { findFirst: mock(), update: mock(), updateMany: mock(async (_input: any) => ({ count: 1 })) },
  lessonPlanMessage: { findFirst: mock() },
  lessonPlanMaterial: { updateMany: mock() },
  lessonShareLink: { count: mock(async () => 0) },
  user: { findUnique: mock(async (_input: any) => ({ name: 'Brian Smith' })) },
  lessonPlanTemplate: { create: mock(async (_input: any) => ({ id: 'tpl-1' })) },
};
const ensureStudentVersion = mock();
const share = {
  createShareLink: mock(async (_input: any) => ({ id: 'link-1', token: 'tok_abcdefghijklmnopqrstuvwxyz' })),
  emailLessonLink: mock(async (_input: any) => ({ delivery: 'sent' })),
  revokeShareLinks: mock(async (_id: string, _audience?: string) => undefined),
  rewriteForAudience: mock(async (_input: any) => '## Minute 0 · Hook'),
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
const saveStepNotes = mock(async (_input: any) => undefined);
const teacherNotesFor = mock(async (_input: any) => ({ s1: 'Open with: Ask what they carry.' }));
const noteSteps = mock((_loaded: any) => [{ id: 's1', title: 'Starter', minutes: 5, content: 'Write.' }]);

mock.module('~/utils/auth.server', () => ({ requireMutableRequest, requireUserId: mock(), requireMembership: mock() }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/lesson-planner/lesson-planner-access.server', () => ({ requireLessonPlannerAccess }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({ getLessonPlannerReviewFlags }));
mock.module('~/domain/lesson-planner/load-stack-v3.server', () => ({ loadStackV3 }));
mock.module('~/domain/lesson-planner/stack-actions.server', () => actions);
mock.module('~/domain/lesson-planner/stack-command.server', () => ({ runStackCommand }));
mock.module('~/domain/lesson-planner/step-handout.server', () => ({ ensureStudentVersion }));
mock.module('~/domain/lesson-planner/lesson-share.server', () => share);
mock.module('~/domain/lesson-planner/teacher-notes.server', () => ({ saveStepNotes, teacherNotesFor, noteSteps }));

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

describe("handouts for any step (Brian's run 3, item 8)", () => {
  test('a step is written for students on request', async () => {
    ensureStudentVersion.mockReset().mockResolvedValue({ content: 'Pick one object.' });
    const response = await post({ intent: 'student-version', conversationId: 'plan-1', materialId: 'hook' });
    expect(ensureStudentVersion.mock.calls[0][0]).toMatchObject({ conversationId: 'plan-1', materialId: 'hook' });
    expect(response.data).toEqual({ ok: true, materialId: 'hook', content: 'Pick one object.' });
  });

  test('a model failure says to try again, and changes nothing', async () => {
    ensureStudentVersion.mockReset().mockRejectedValue(new Error('budget'));
    const response = await post({ intent: 'student-version', conversationId: 'plan-1', materialId: 'hook' });
    expect(response.init.status).toBe(503);
  });

  test('a step goes in or out of the handouts', async () => {
    prisma.lessonPlanMaterial.updateMany.mockReset().mockResolvedValue({ count: 1 });
    await post({ intent: 'set-handout', conversationId: 'plan-1', materialId: 'hook', hasHandout: 'false' });
    expect(prisma.lessonPlanMaterial.updateMany.mock.calls[0][0]).toEqual({
      where: { id: 'hook', conversationId: 'plan-1' },
      data: { hasHandout: false },
    });
  });
});

describe('Post to your class and Send this lesson (stack page redesign)', () => {
  test('nothing without the share flag', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, share: false });
    const response = await post({ intent: 'create-share', conversationId: 'plan-1', includes: 'deck' });
    expect(response.init.status).toBe(404);
  });

  test('posting makes one student link that opens what was checked', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, share: true });
    const response = await post({ intent: 'create-share', conversationId: 'plan-1', includes: 'deck,handouts,junk' });
    expect(share.revokeShareLinks).toHaveBeenCalledWith('plan-1', 'student');
    expect(share.createShareLink.mock.calls.at(-1)![0]).toMatchObject({ audience: 'student', includes: ['deck', 'handouts'] });
    expect(response.data.url).toBe('http://localhost/l/tok_abcdefghijklmnopqrstuvwxyz');
  });

  test('a sub plan is rewritten for the sub, linked, and emailed with the note', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, share: true });
    loadStackV3.mockResolvedValue({
      packet: { title: 'Day One', className: 'English 10' },
      v3: {
        timing: { blocks: [{ id: 'hook', title: 'Hook', minutes: 15, startsAt: 0 }] },
        steps: [{ id: 'hook', excerpt: 'Bags out.', content: 'Bags out.' }],
      },
    });
    const response = await post({
      intent: 'send-lesson',
      conversationId: 'plan-1',
      audience: 'sub',
      recipient: 'sub@school.org',
      includes: 'plan,handouts,deck',
      note: 'Fire drill at 10.',
    });
    expect(share.createShareLink.mock.calls.at(-1)![0]).toMatchObject({
      audience: 'sub',
      note: 'Fire drill at 10.',
      body: '## Minute 0 · Hook',
    });
    expect(share.emailLessonLink.mock.calls.at(-1)![0]).toMatchObject({
      to: 'sub@school.org',
      audience: 'sub',
      title: 'Day One',
      note: 'Fire drill at 10.',
      teacherName: 'Brian Smith',
    });
    expect(response.data.sentTo).toBe('sub@school.org');
    expect(response.data.delivery).toBe('sent');
  });

  test("a preview, where no email goes out, says so (Brian's run 4, item 5)", async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, share: true });
    loadStackV3.mockResolvedValue({
      packet: { title: 'Day One', className: 'English 10' },
      v3: { timing: { blocks: [] }, steps: [], standards: [], lessonDate: null },
    });
    share.emailLessonLink.mockResolvedValueOnce({ delivery: 'preview' });
    const response = await post({ intent: 'send-lesson', conversationId: 'plan-1', audience: 'admin', recipient: 'p@school.org', includes: 'plan' });
    expect(response.data).toMatchObject({ delivery: 'preview' });
  });

  test('a bad address is refused, and so is a 21st send in a day', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, share: true });
    const badAddress = await post({ intent: 'send-lesson', conversationId: 'plan-1', audience: 'family', recipient: 'nope' });
    expect(badAddress.init.status).toBe(422);
    prisma.lessonShareLink.count.mockResolvedValue(20);
    const tooMany = await post({ intent: 'send-lesson', conversationId: 'plan-1', audience: 'family', recipient: 'f@x.org' });
    expect(tooMany.init.status).toBe(429);
  });
});

describe('Save this shape as a template (stack page redesign)', () => {
  test('saves the order and timing, never the content', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, templates: true });
    loadStackV3.mockResolvedValue({
      v3: {
        timing: {
          blocks: [
            { id: 'cs', title: 'Starter', type: 'class_starter', minutes: 5, isWriting: true },
            { id: 'hook', title: 'Hook', type: 'activity', minutes: 15, isWriting: false },
          ],
        },
        steps: [{ id: 'cs', label: null }, { id: 'hook', label: null }],
      },
    });
    const response = await post({ intent: 'save-template', conversationId: 'plan-1', name: 'Starter + hook' });
    const data = prisma.lessonPlanTemplate.create.mock.calls.at(-1)![0].data;
    expect(data).toMatchObject({ name: 'Starter + hook', periodMinutes: 50, membershipId: 'teacher-1' });
    expect(data.slots).toEqual([
      { type: 'class_starter', minutes: 5, label: null, isWriting: true },
      { type: 'activity', minutes: 15, label: null, isWriting: false },
    ]);
    expect(JSON.stringify(data)).not.toContain('Hook');
    expect(response.data.templateId).toBe('tpl-1');
  });
});

describe('teacher notes (Oct 24 handoff, task 7)', () => {
  test('an edit saves that step’s notes, only with the flag', async () => {
    saveStepNotes.mockClear();
    let response = await post({ intent: 'set-notes', conversationId: 'plan-1', stepId: 'm:a', notes: 'Say: hello' });
    expect(response.init?.status).toBe(404);
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: true });
    response = await post({ intent: 'set-notes', conversationId: 'plan-1', stepId: 'mat-1', notes: 'Say: hello' });
    expect(response.data).toEqual({ ok: true });
    expect(saveStepNotes).toHaveBeenCalledWith({ conversationId: 'plan-1', stepId: 'mat-1', notes: 'Say: hello' });
    response = await post({ intent: 'set-notes', conversationId: 'plan-1', notes: 'x' });
    expect(response.init?.status).toBe(400);
  });
});

describe('teacher notes written in the background (Kevin, Oct 25, note 12c)', () => {
  test('write-notes answers with the lesson\'s notes, only with the flag', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true });
    expect((await post({ intent: 'write-notes', conversationId: 'plan-1' })).init?.status).toBe(404);
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: true });
    loadStackV3.mockResolvedValue({ packet: { title: 'Day 1', className: null }, v3: {} });
    const response = await post({ intent: 'write-notes', conversationId: 'plan-1' });
    expect(response.data).toEqual({ ok: true, notes: { s1: 'Open with: Ask what they carry.' } });
    expect(teacherNotesFor.mock.calls.at(-1)![0]).toMatchObject({ conversationId: 'plan-1', steps: [{ id: 's1' }] });
  });

  test('setting the lesson starts the notes, without waiting for them', async () => {
    teacherNotesFor.mockClear();
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: true });
    loadStackV3.mockResolvedValue({ packet: { title: 'Day 1', className: null }, v3: {} });
    const response = await post({ intent: 'set-lesson', conversationId: 'plan-1' });
    expect(response.data).toEqual({ ok: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(teacherNotesFor).toHaveBeenCalledTimes(1);
  });
});

describe("extensions and the deck (Kevin's notes 8c, 9)", () => {
  test('a step moves to the extensions, and back', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: true });
    prisma.lessonPlanConversation.findFirst.mockResolvedValue({ id: 'plan-1', extensionStepIds: ['a'] });
    let response = await post({ intent: 'set-extension', conversationId: 'plan-1', stepId: 'b', extension: 'true' });
    expect(response.data).toEqual({ ok: true, extension: 'b' });
    expect(prisma.lessonPlanConversation.update.mock.calls[0][0]).toEqual({
      where: { id: 'plan-1' },
      data: { extensionStepIds: ['a', 'b'] },
    });
    response = await post({ intent: 'set-extension', conversationId: 'plan-1', stepId: 'a', extension: 'false' });
    expect(prisma.lessonPlanConversation.update.mock.calls[1][0].data).toEqual({ extensionStepIds: [] });
  });

  test('extensions need the flag and a step', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: false });
    expect((await post({ intent: 'set-extension', conversationId: 'plan-1', stepId: 'b', extension: 'true' })).init.status).toBe(404);
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: true });
    expect((await post({ intent: 'set-extension', conversationId: 'plan-1', extension: 'true' })).init.status).toBe(400);
  });

  test('Keep these slides starts the deck key again', async () => {
    getLessonPlannerReviewFlags.mockResolvedValue({ stackV3: true, teachNotes: true });
    const response = await post({ intent: 'keep-deck', conversationId: 'plan-1' });
    expect(response.data).toEqual({ ok: true });
    expect(prisma.lessonPlanConversation.update.mock.calls[0][0]).toEqual({ where: { id: 'plan-1' }, data: { deckStackKey: null } });
  });
});

describe("active time (Brian's round 5, item 12)", () => {
  test('adds the seconds in use, only while the lesson is not set', async () => {
    prisma.lessonPlanConversation.updateMany.mockClear();
    const response = await post({ intent: 'active-time', conversationId: 'plan-1', seconds: '60' });
    expect(response.data).toEqual({ ok: true });
    expect(prisma.lessonPlanConversation.updateMany).toHaveBeenCalledWith({
      where: { id: 'plan-1', setAt: null },
      data: { activeSeconds: { increment: 60 } },
    });
  });

  test('never more than two minutes at a time', async () => {
    prisma.lessonPlanConversation.updateMany.mockClear();
    const response = await post({ intent: 'active-time', conversationId: 'plan-1', seconds: '3600' });
    expect(response.init.status).toBe(422);
    expect(prisma.lessonPlanConversation.updateMany).not.toHaveBeenCalled();
  });
});
