import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const tx = {
  $queryRaw: mock(),
  classAssignment: { findUnique: mock() },
  documentGroup: { create: mock(), delete: mock(), findFirst: mock() },
  documentGroupMember: { updateMany: mock(), upsert: mock() },
};

const prisma = {
  $transaction: mock(async (fn: any) => fn(tx)),
};

const createAssignmentGroupArtifactInTransaction = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('./assignment-artifact.server', () => ({
  createAssignmentGroupArtifactInTransaction,
}));

const {
  addGroup,
  createLateStudentGroup,
  GroupEditingError,
  moveStudentToGroup,
  removeEmptyGroup,
} = await import('./group-editing.server');

afterAll(() => {
  mock.restore();
});

const CA = 'ca-1';
const OPENED_AT = new Date('2026-08-17T12:00:00Z');

const classAssignment = ({
  opened = false,
  mode = 'teacher',
  roster = ['s-1', 's-2', 's-3'],
  groups = [
    { id: 'g-1', ordinal: 0, members: [{ membershipId: 's-1' }] },
    { id: 'g-2', ordinal: 1, members: [{ membershipId: 's-2' }] },
  ] as { id: string; ordinal: number; members: { membershipId: string }[] }[],
}: {
  opened?: boolean;
  mode?: string;
  roster?: string[];
  groups?: {
    id: string;
    ordinal: number;
    members: { membershipId: string }[];
  }[];
} = {}) => ({
  id: CA,
  assignment: { collaborationGroupMode: mode },
  class: { students: roster.map((id) => ({ id })) },
  documentGroups: groups.map((group) => ({
    ...group,
    openedAt: opened ? OPENED_AT : null,
    documentId: opened ? `doc-${group.id}` : null,
  })),
});

function resetAll() {
  for (const model of Object.values(tx)) {
    if (typeof model === 'function') {
      model.mockReset();
      continue;
    }
    for (const fn of Object.values(model)) fn.mockReset();
  }
  tx.$queryRaw.mockResolvedValue([{ id: 'locked' }]);
  tx.classAssignment.findUnique.mockResolvedValue(classAssignment());
  prisma.$transaction.mockReset().mockImplementation(async (fn: any) => fn(tx));
  createAssignmentGroupArtifactInTransaction
    .mockReset()
    .mockResolvedValue({ documentId: 'doc-new', created: true });
  tx.documentGroup.create.mockResolvedValue({ id: 'g-new', label: 'Group 3' });
  tx.documentGroupMember.updateMany.mockResolvedValue({ count: 0 });
  tx.documentGroupMember.upsert.mockResolvedValue({});
  tx.documentGroup.delete.mockResolvedValue({});
}

describe('moveStudentToGroup', () => {
  beforeEach(resetAll);

  const move = (overrides = {}) =>
    moveStudentToGroup({
      classAssignmentId: CA,
      membershipId: 's-1',
      targetGroupId: 'g-2',
      ...overrides,
    });

  test('withdraws the student from every other group in this class assignment', async () => {
    // Soft-removed, not deleted: a student who was in a group keeps that
    // history, and removedAt is what withdraws write access.
    await move();

    const call = tx.documentGroupMember.updateMany.mock.calls[0][0];
    expect(call.where.membershipId).toBe('s-1');
    expect(call.where.removedAt).toBeNull();
    expect(call.where.group).toEqual({ classAssignmentId: CA });
    expect(call.data.removedAt).toBeInstanceOf(Date);
  });

  test('adds the student to the target group', async () => {
    await move();

    const call = tx.documentGroupMember.upsert.mock.calls[0][0];
    expect(call.where.groupId_membershipId).toEqual({
      groupId: 'g-2',
      membershipId: 's-1',
    });
    expect(call.create).toEqual({ groupId: 'g-2', membershipId: 's-1' });
  });

  test('restores a student dropped back into a group they left', async () => {
    // [groupId, membershipId] is unique, so a plain create would collide with
    // the soft-removed row from the first time they were in this group.
    await move();

    expect(tx.documentGroupMember.upsert.mock.calls[0][0].update).toEqual({
      removedAt: null,
    });
  });

  test('moving to the unassigned bucket withdraws without adding', async () => {
    await move({ targetGroupId: null });

    expect(tx.documentGroupMember.updateMany).toHaveBeenCalled();
    expect(tx.documentGroupMember.upsert).not.toHaveBeenCalled();
  });

  test('dropping a student back on their own group is a no-op', async () => {
    // Dragging within the same group happens constantly and must not churn
    // membership rows or trip the size ceiling.
    await move({ membershipId: 's-1', targetGroupId: 'g-1' });

    expect(tx.documentGroupMember.updateMany).not.toHaveBeenCalled();
    expect(tx.documentGroupMember.upsert).not.toHaveBeenCalled();
  });

  test('refuses once groups are opened', async () => {
    // The lifecycle boundary: groups own drafts students have written in, so
    // moving someone would move them between documents holding real content.
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ opened: true })
    );

    await expect(move()).rejects.toThrow(/finalized/i);
    expect(tx.documentGroupMember.upsert).not.toHaveBeenCalled();
  });

  test('places a late-enrolled unassigned student into an existing finalized group', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ opened: true })
    );

    await move({ membershipId: 's-3', targetGroupId: 'g-2' });

    expect(tx.documentGroupMember.updateMany).toHaveBeenCalled();
    expect(tx.documentGroupMember.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { groupId: 'g-2', membershipId: 's-3' },
      })
    );
  });

  test('refuses a student who is not on this class roster', async () => {
    await expect(move({ membershipId: 's-outsider' })).rejects.toThrow(
      GroupEditingError
    );
    expect(tx.documentGroupMember.upsert).not.toHaveBeenCalled();
  });

  test('refuses a group belonging to a different class assignment', async () => {
    // The group id comes from the browser, so it cannot be trusted to name a
    // group on this page.
    await expect(move({ targetGroupId: 'g-elsewhere' })).rejects.toThrow(
      GroupEditingError
    );
    expect(tx.documentGroupMember.upsert).not.toHaveBeenCalled();
  });

  test('refuses to overfill a group', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({
        roster: Array.from({ length: 12 }, (_, i) => `s-${i}`),
        groups: [
          { id: 'g-1', ordinal: 0, members: [{ membershipId: 's-0' }] },
          {
            id: 'g-2',
            ordinal: 1,
            members: Array.from({ length: 8 }, (_, i) => ({
              membershipId: `s-${i + 1}`,
            })),
          },
        ],
      })
    );

    await expect(
      move({ membershipId: 's-0', targetGroupId: 'g-2' })
    ).rejects.toThrow(/at most 8/i);
  });

  test('refuses a class assignment that does not exist', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(null);

    await expect(move()).rejects.toThrow(GroupEditingError);
  });
});

describe('addGroup', () => {
  beforeEach(resetAll);

  const add = () => addGroup({ classAssignmentId: CA });

  test('creates an empty group after the last one', async () => {
    await add();

    const data = tx.documentGroup.create.mock.calls[0][0].data;
    expect(data.classAssignmentId).toBe(CA);
    expect(data.ordinal).toBe(2);
    expect(data.label).toBe('Group 3');
  });

  test('starts at ordinal 0 when there are no groups yet', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ groups: [] })
    );

    await add();

    expect(tx.documentGroup.create.mock.calls[0][0].data.ordinal).toBe(0);
  });

  test('skips ordinals left behind by a deleted group', async () => {
    // [classAssignmentId, ordinal] is unique, so reusing a gap would collide
    // with nothing today but would the moment two groups were deleted.
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({
        groups: [{ id: 'g-5', ordinal: 5, members: [] }],
      })
    );

    await add();

    expect(tx.documentGroup.create.mock.calls[0][0].data.ordinal).toBe(6);
  });

  test('refuses once groups are opened', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ opened: true })
    );

    await expect(add()).rejects.toThrow(/finalized/i);
  });

  test('refuses to create a second group for whole-class collaboration', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ mode: 'whole-class' })
    );

    await expect(add()).rejects.toThrow(/single shared group/i);
    expect(tx.documentGroup.create).not.toHaveBeenCalled();
  });
});

describe('createLateStudentGroup', () => {
  beforeEach(resetAll);

  test('atomically creates and opens a new artifact for an unassigned late student', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ opened: true })
    );

    const result = await createLateStudentGroup({
      classAssignmentId: CA,
      membershipId: 's-3',
    });

    expect(tx.documentGroup.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          classAssignmentId: CA,
          members: { create: { membershipId: 's-3' } },
        }),
      })
    );
    expect(createAssignmentGroupArtifactInTransaction).toHaveBeenCalledWith(
      tx,
      { groupId: 'g-new' }
    );
    expect(result.documentId).toBe('doc-new');
  });

  test('requires a late student to join the existing whole-class group', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({ opened: true, mode: 'whole-class' })
    );

    await expect(
      createLateStudentGroup({
        classAssignmentId: CA,
        membershipId: 's-3',
      })
    ).rejects.toThrow(/existing whole-class group/i);
    expect(tx.documentGroup.create).not.toHaveBeenCalled();
  });
});

describe('removeEmptyGroup', () => {
  beforeEach(resetAll);

  const remove = (groupId = 'g-3') =>
    removeEmptyGroup({ classAssignmentId: CA, groupId });

  test('deletes a group that has nobody in it', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({
        groups: [
          { id: 'g-1', ordinal: 0, members: [{ membershipId: 's-1' }] },
          { id: 'g-3', ordinal: 2, members: [] },
        ],
      })
    );

    await remove();

    expect(tx.documentGroup.delete).toHaveBeenCalledWith({
      where: { id: 'g-3' },
    });
  });

  test('refuses a group that still has members', async () => {
    // Deleting would silently unassign them; the teacher should drag them out
    // first so they can see where everyone went.
    await expect(remove('g-1')).rejects.toThrow(/still has/i);
    expect(tx.documentGroup.delete).not.toHaveBeenCalled();
  });

  test('refuses a group from another class assignment', async () => {
    await expect(remove('g-elsewhere')).rejects.toThrow(GroupEditingError);
    expect(tx.documentGroup.delete).not.toHaveBeenCalled();
  });

  test('refuses once groups are opened', async () => {
    tx.classAssignment.findUnique.mockResolvedValue(
      classAssignment({
        opened: true,
        groups: [{ id: 'g-3', ordinal: 2, members: [] }],
      })
    );

    await expect(remove()).rejects.toThrow(/finalized/i);
  });
});
