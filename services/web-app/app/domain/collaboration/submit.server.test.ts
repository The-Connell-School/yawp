import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: { findFirst: mock(), create: mock() },
  document: { update: mock() },
  user: { findUnique: mock() },
  submissionActivity: { create: mock() },
  documentWriteJournal: { create: mock(), update: mock() },
  $queryRaw: mock(),
  $transaction: mock(),
};
const readRoomState = mock();
const yUpdateToSnapshot = mock();

const actualRoomStore =
  globalThis.__realModules['~/domain/collaboration/room-store.server'];
const actualSnapshot =
  globalThis.__realModules['~/domain/collaboration/snapshot'];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/collaboration/room-store.server', () => ({
  ...actualRoomStore,
  readRoomState,
}));
mock.module('~/domain/collaboration/snapshot', () => ({
  ...actualSnapshot,
  yUpdateToSnapshot,
}));

const { GroupSubmitError, submitGroupDraft } = await import('./submit.server');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/domain/collaboration/room-store.server',
    () => actualRoomStore
  );
  mock.module('~/domain/collaboration/snapshot', () => actualSnapshot);
});

describe('submitGroupDraft', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset().mockResolvedValue(null);
    prisma.submission.create
      .mockReset()
      .mockResolvedValue({ id: 'sub-1', submittedAt: new Date() });
    prisma.document.update.mockReset().mockResolvedValue({});
    prisma.user.findUnique.mockReset().mockResolvedValue({
      name: 'Sam Student',
      email: 'sam@example.com',
    });
    prisma.submissionActivity.create.mockReset().mockResolvedValue({});
    prisma.$queryRaw.mockReset().mockResolvedValue([{ id: 'doc-1' }]);
    prisma.documentWriteJournal.create
      .mockReset()
      .mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockReset().mockResolvedValue({});
    prisma.$transaction.mockReset().mockImplementation(async (fn: any) =>
      fn({
        submission: prisma.submission,
        document: prisma.document,
        user: prisma.user,
        submissionActivity: prisma.submissionActivity,
        $queryRaw: prisma.$queryRaw,
      })
    );
    readRoomState.mockReset().mockResolvedValue(new Uint8Array([1, 2, 3]));
    yUpdateToSnapshot.mockReset().mockReturnValue({
      html: '<p>The group wrote this.</p>',
      text: 'The group wrote this.',
    });
  });

  const submit = (overrides = {}) =>
    submitGroupDraft({
      document: {
        id: 'doc-1',
        title: 'Expansion Plan',
        revision: 4,
        html: '<p>stale</p>',
        text: 'stale',
      },
      userId: 'user-1',
      membershipId: 'member-1',
      organizationId: 'org-1',
      ...overrides,
    });

  test('submits what is in the room, not the stored snapshot', async () => {
    // The dual-write can lag a keystroke behind, so reading the room at submit
    // time is what stops a group submitting a version they can see is out of
    // date on screen.
    await submit();

    expect(prisma.submission.create.mock.calls[0][0].data.text).toBe(
      'The group wrote this.'
    );
  });

  test('falls back to the stored snapshot when the room cannot be read', async () => {
    readRoomState.mockResolvedValue(null);

    await submit();

    expect(prisma.submission.create.mock.calls[0][0].data.text).toBe('stale');
  });

  test('is idempotent: a second press returns the first submission', async () => {
    // Any group member can submit, so two students pressing at once is ordinary
    // rather than exotic. Two submissions for one draft would double-grade it.
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-existing',
      submittedAt: new Date('2026-08-18T09:00:00Z'),
    });

    const result = await submit();

    expect(result).toMatchObject({
      submissionId: 'sub-existing',
      created: false,
    });
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  test('ignores an unsubmitted submission when deciding whether one exists', async () => {
    // A teacher who unsubmits is inviting the group to submit again.
    await submit();

    const where = prisma.submission.findFirst.mock.calls[0][0].where;
    expect(where.unsubmittedAt).toBeNull();
  });

  test('refuses an empty draft', async () => {
    yUpdateToSnapshot.mockReturnValue({ html: '', text: '' });

    await expect(submit()).rejects.toThrow(/empty/i);
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  test('journals the submit against the member who pressed it', async () => {
    // One student submits on behalf of the group; the record says which one.
    await submit();

    const data = prisma.documentWriteJournal.create.mock.calls[0][0].data;
    expect(data.membershipId).toBe('member-1');
    expect(data.eventType).toBe('document.submit');
    expect(data.source).toBe('collab-submit');
  });

  test('records submission creation in the activity ledger', async () => {
    await submit();

    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    expect(
      prisma.submissionActivity.create.mock.calls[0][0].data
    ).toMatchObject({
      organizationId: 'org-1',
      actorMembershipId: 'member-1',
      eventType: 'submission.created',
      source: 'collab-submit',
    });
  });

  test('rechecks after locking so two members cannot create active submissions', async () => {
    prisma.submission.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'sub-winner' });

    const result = await submit();

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ submissionId: 'sub-winner', created: false });
    expect(prisma.submission.create).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
  });

  test('marks the journal accepted once the submission is stored', async () => {
    await submit();

    expect(
      prisma.documentWriteJournal.update.mock.calls[0][0].data.status
    ).toBe('accepted');
  });

  test('marks the journal rejected when storing fails, and rethrows', async () => {
    prisma.$transaction.mockRejectedValue(new Error('deadlock'));

    await expect(submit()).rejects.toThrow(/deadlock/);
    expect(
      prisma.documentWriteJournal.update.mock.calls[0][0].data.status
    ).toBe('rejected');
  });

  test('a snapshot that cannot be derived is refused rather than submitted blank', async () => {
    yUpdateToSnapshot.mockImplementation(() => {
      throw new Error('corrupt state');
    });

    await expect(submit()).rejects.toThrow(GroupSubmitError);
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });
});
