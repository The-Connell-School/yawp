import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: { findFirst: mock(), create: mock() },
  document: { update: mock() },
  documentGroup: { findFirst: mock() },
  documentGroupMember: { updateMany: mock() },
  documentWriteJournal: { create: mock(), update: mock() },
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

const {
  GroupSubmitError,
  readGroupSubmitState,
  submitGroupDraft,
  withdrawGroupSubmit,
} = await import('./submit.server');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/domain/collaboration/room-store.server',
    () => actualRoomStore
  );
  mock.module('~/domain/collaboration/snapshot', () => actualSnapshot);
});

const SAM = 'member-1';
const TAYLOR = 'member-2';

type FakeMember = {
  membershipId: string;
  submittedAt: Date | null;
  membership: { user: { name: string } };
};

/**
 * A tiny stand-in for the group's rows, because the marks are the state this
 * feature turns on: the code marks a member and then re-reads the group to see
 * whether that press completed the set, so a findFirst mock returning a frozen
 * roster would never show a press landing.
 */
let groupRows: { id: string; members: FakeMember[] } | null = null;

const group = (
  ...members: [membershipId: string, name: string, submittedAt: Date | null][]
) => ({
  id: 'group-1',
  members: members.map(([membershipId, name, submittedAt]) => ({
    membershipId,
    submittedAt,
    membership: { user: { name } },
  })),
});

const readGroup = async () =>
  groupRows
    ? {
        id: groupRows.id,
        members: groupRows.members.map((row) => ({ ...row })),
      }
    : null;

const applyMemberUpdate = async ({ where, data }: any) => {
  // The code filters members through the group's relation, so a group that is
  // not this document's matches nothing.
  if (!groupRows || where.group?.is?.documentId !== 'doc-1')
    return { count: 0 };
  const matched = groupRows.members.filter((member) => {
    if (where.membershipId && member.membershipId !== where.membershipId) {
      return false;
    }
    if (where.submittedAt === null && member.submittedAt !== null) return false;
    return true;
  });
  for (const member of matched) member.submittedAt = data.submittedAt;
  return { count: matched.length };
};

describe('submitGroupDraft', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset().mockResolvedValue(null);
    prisma.submission.create
      .mockReset()
      .mockResolvedValue({ id: 'sub-1', submittedAt: new Date() });
    prisma.document.update.mockReset().mockResolvedValue({});
    groupRows = group([SAM, 'Sam Reyes', null]);
    prisma.documentGroup.findFirst.mockReset().mockImplementation(readGroup);
    prisma.documentGroupMember.updateMany
      .mockReset()
      .mockImplementation(applyMemberUpdate);
    prisma.documentWriteJournal.create
      .mockReset()
      .mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockReset().mockResolvedValue({});
    prisma.$transaction.mockReset().mockImplementation(async (fn: any) =>
      fn({
        submission: prisma.submission,
        document: prisma.document,
        documentGroupMember: prisma.documentGroupMember,
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
      membershipId: SAM,
      ...overrides,
    });

  /**
   * The rule this feature exists for: one member pressing is a signal to their
   * group, not a submission to the teacher.
   */
  describe('every member has to press', () => {
    test('the first press of two records the member and submits nothing', async () => {
      groupRows = group(
        [SAM, 'Sam Reyes', null],
        [TAYLOR, 'Taylor Nguyen', null]
      );

      const result = await submit();

      expect(result.status).toBe('waiting');
      expect(result.submissionId).toBeNull();
      expect(prisma.submission.create).not.toHaveBeenCalled();
      expect(result.readiness.waitingOn.map((member) => member.name)).toEqual([
        'Taylor Nguyen',
      ]);
    });

    test('marks the pressing member, and only them', async () => {
      groupRows = group(
        [SAM, 'Sam Reyes', null],
        [TAYLOR, 'Taylor Nguyen', null]
      );

      await submit({ now: new Date('2026-08-22T10:00:00Z') });

      const call = prisma.documentGroupMember.updateMany.mock.calls[0][0];
      expect(call.where).toMatchObject({
        group: { is: { documentId: 'doc-1' } },
        membershipId: SAM,
        removedAt: null,
        // A second press must not move the timestamp: the roster should show
        // when someone committed, not when they last clicked.
        submittedAt: null,
      });
      expect(call.data.submittedAt).toEqual(new Date('2026-08-22T10:00:00Z'));
    });

    test('the press that completes the set is the one that submits', async () => {
      // Taylor presses last: Sam is already marked, so this press finishes it.
      groupRows = group(
        [SAM, 'Sam Reyes', new Date('2026-08-22T10:00:00Z')],
        [TAYLOR, 'Taylor Nguyen', null]
      );

      const result = await submit({ membershipId: TAYLOR });

      expect(result.status).toBe('submitted');
      expect(result.created).toBe(true);
      expect(prisma.submission.create).toHaveBeenCalled();
    });

    test('clears every mark once the draft is in, so an unsubmit needs fresh agreement', async () => {
      await submit();

      const clearing =
        prisma.documentGroupMember.updateMany.mock.calls.at(-1)?.[0];
      expect(clearing).toMatchObject({
        where: { group: { is: { documentId: 'doc-1' } } },
        data: { submittedAt: null },
      });
    });

    test('a lone member submits on their own press', async () => {
      // A shared draft can end up with one active writer; waiting for a second
      // person who does not exist would lock the draft shut.
      const result = await submit();

      expect(result.status).toBe('submitted');
    });

    test('a draft with no group row is still submittable', async () => {
      // Defensive: the route only serves collaborative rooms, but nothing should
      // be able to strand a document with no way to hand it in.
      groupRows = null;

      const result = await submit();

      expect(result.status).toBe('submitted');
    });

    test('records the whole group in the journal, not just the last presser', async () => {
      groupRows = group(
        [SAM, 'Sam Reyes', new Date('2026-08-22T10:00:00Z')],
        [TAYLOR, 'Taylor Nguyen', null]
      );

      await submit({ membershipId: TAYLOR });

      const data = prisma.documentWriteJournal.create.mock.calls[0][0].data;
      expect(data.membershipId).toBe(TAYLOR);
      expect(data.metadata.submittedByMembershipIds).toEqual([SAM, TAYLOR]);
    });

    test('nothing is journalled while the group is still waiting', async () => {
      groupRows = group(
        [SAM, 'Sam Reyes', null],
        [TAYLOR, 'Taylor Nguyen', null]
      );

      await submit();

      expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
    });

    test('refuses an empty draft on the first press, not only the last', async () => {
      // Otherwise the group finds out the draft was empty from whoever happened
      // to press last, at the deadline.
      groupRows = group(
        [SAM, 'Sam Reyes', null],
        [TAYLOR, 'Taylor Nguyen', null]
      );
      yUpdateToSnapshot.mockReturnValue({ html: '', text: '' });

      await expect(submit()).rejects.toThrow(/empty/i);
      expect(prisma.documentGroupMember.updateMany).not.toHaveBeenCalled();
    });
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
    // Any group member can press the button that completes the set, so two
    // presses landing together is ordinary rather than exotic. Two submissions
    // for one draft would double-grade it.
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-existing',
      submittedAt: new Date('2026-08-18T09:00:00Z'),
    });

    const result = await submit();

    expect(result).toMatchObject({
      submissionId: 'sub-existing',
      created: false,
      status: 'already-submitted',
    });
    expect(prisma.submission.create).not.toHaveBeenCalled();
  });

  test('two members completing the set at once still produce one submission', async () => {
    // The mark this member wrote makes the other member look like the last
    // press too. The in-transaction re-read is what keeps that from creating a
    // second submission.
    prisma.submission.findFirst
      .mockResolvedValueOnce(null) // the pre-check, before the other press landed
      .mockResolvedValue({ id: 'sub-raced' }); // inside the transaction

    const result = await submit();

    expect(prisma.submission.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: 'already-submitted',
      submissionId: 'sub-raced',
      created: false,
    });
    expect(
      prisma.documentWriteJournal.update.mock.calls[0][0].data.status
    ).toBe('rejected');
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
    // One student completes the set on behalf of the group; the record says
    // which one.
    await submit();

    const data = prisma.documentWriteJournal.create.mock.calls[0][0].data;
    expect(data.membershipId).toBe(SAM);
    expect(data.eventType).toBe('document.submit');
    expect(data.source).toBe('collab-submit');
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

describe('withdrawGroupSubmit', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset().mockResolvedValue(null);
    groupRows = group(
      [SAM, 'Sam Reyes', new Date('2026-08-22T10:00:00Z')],
      [TAYLOR, 'Taylor Nguyen', null]
    );
    prisma.documentGroup.findFirst.mockReset().mockImplementation(readGroup);
    prisma.documentGroupMember.updateMany
      .mockReset()
      .mockImplementation(applyMemberUpdate);
  });

  test('clears one member’s mark', async () => {
    const result = await withdrawGroupSubmit({
      documentId: 'doc-1',
      membershipId: SAM,
    });

    expect(
      prisma.documentGroupMember.updateMany.mock.calls[0][0]
    ).toMatchObject({
      where: {
        group: { is: { documentId: 'doc-1' } },
        membershipId: SAM,
        removedAt: null,
      },
      data: { submittedAt: null },
    });
    expect(result.readiness.everyoneSubmitted).toBe(false);
  });

  test('refuses once the group has actually submitted', async () => {
    // Undoing a real submission is a teacher's call, not a classmate's.
    prisma.submission.findFirst.mockResolvedValue({ id: 'sub-1' });

    await expect(
      withdrawGroupSubmit({ documentId: 'doc-1', membershipId: SAM })
    ).rejects.toThrow(/teacher/i);
    expect(prisma.documentGroupMember.updateMany).not.toHaveBeenCalled();
  });
});

describe('readGroupSubmitState', () => {
  beforeEach(() => {
    prisma.submission.findFirst.mockReset().mockResolvedValue(null);
    groupRows = group(
      [SAM, 'Sam Reyes', new Date('2026-08-22T10:00:00Z')],
      [TAYLOR, 'Taylor Nguyen', null]
    );
    prisma.documentGroup.findFirst.mockReset().mockImplementation(readGroup);
  });

  test('reports who has pressed and who has not', async () => {
    const state = await readGroupSubmitState({
      documentId: 'doc-1',
      viewerMembershipId: TAYLOR,
    });

    expect(state.submittedAt).toBeNull();
    expect(state.readiness.submittedCount).toBe(1);
    expect(state.readiness.viewerSubmitted).toBe(false);
    expect(state.readiness.waitingOn.map((member) => member.name)).toEqual([
      'Taylor Nguyen',
    ]);
  });

  test('reports the submission once the group has handed it in', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      submittedAt: new Date('2026-08-22T11:00:00Z'),
    });

    const state = await readGroupSubmitState({
      documentId: 'doc-1',
      viewerMembershipId: TAYLOR,
    });

    expect(state.submissionId).toBe('sub-1');
    expect(state.submittedAt).toBe('2026-08-22T11:00:00.000Z');
  });
});
