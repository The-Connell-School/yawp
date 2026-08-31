import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findUnique: mock() },
  documentGroup: {
    deleteMany: mock(),
    create: mock(),
    updateMany: mock(),
    findFirst: mock(),
  },
  $transaction: mock(),
};

const createAssignmentGroupArtifact = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('./assignment-artifact.server', () => ({
  createAssignmentGroupArtifact,
}));

const {
  arrangeGroups,
  findStudentGroupDocument,
  GroupProvisioningError,
  openGroups,
} = await import('./groups.server');

afterAll(() => {
  mock.restore();
});

const classAssignmentWithGroups = (
  groups: {
    id: string;
    documentId: string | null;
    openedAt: Date | null;
    members: { membershipId: string }[];
  }[],
  {
    collaborationEnabled = true,
    roster = [
      ...new Set(
        groups.flatMap((group) => group.members.map((m) => m.membershipId))
      ),
    ],
  }: { collaborationEnabled?: boolean; roster?: string[] } = {}
) => ({
  id: 'ca-1',
  assignmentId: 'a-1',
  assignment: { assignmentTypeId: 'at-1', collaborationEnabled },
  class: { students: roster.map((id) => ({ id })) },
  documentGroups: groups,
});

describe('arrangeGroups', () => {
  beforeEach(() => {
    prisma.classAssignment.findUnique.mockReset();
    prisma.documentGroup.deleteMany.mockReset().mockResolvedValue({ count: 0 });
    prisma.documentGroup.create.mockReset().mockResolvedValue({ id: 'g-new' });
    // Run the callback against the same mock client the module uses.
    prisma.$transaction
      .mockReset()
      .mockImplementation(async (fn: any) => fn(prisma));
  });

  test('creates one group row per planned group, ordinal-numbered', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      class: {
        students: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }],
      },
      documentGroups: [],
    });

    const result = await arrangeGroups({
      classAssignmentId: 'ca-1',
      groupSize: 2,
    });

    expect(result.groupCount).toBe(2);
    expect(prisma.documentGroup.create).toHaveBeenCalledTimes(2);

    const first = prisma.documentGroup.create.mock.calls[0][0].data;
    expect(first.ordinal).toBe(0);
    expect(first.label).toBe('Group 1');
    expect(first.members.create).toEqual([
      { membershipId: 'm1' },
      { membershipId: 'm2' },
    ]);
  });

  test('clears only unopened groups before rebuilding', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      class: { students: [{ id: 'm1' }, { id: 'm2' }] },
      documentGroups: [{ id: 'g-old', openedAt: null }],
    });

    await arrangeGroups({ classAssignmentId: 'ca-1', groupSize: 2 });

    expect(prisma.documentGroup.deleteMany).toHaveBeenCalledWith({
      where: { classAssignmentId: 'ca-1', openedAt: null },
    });
  });

  test('refuses to rearrange once any group has been opened', async () => {
    // Rearranging after opening would move students between drafts that already
    // contain their writing.
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      class: { students: [{ id: 'm1' }, { id: 'm2' }] },
      documentGroups: [{ id: 'g-1', openedAt: new Date('2026-08-17') }],
    });

    await expect(
      arrangeGroups({ classAssignmentId: 'ca-1', groupSize: 2 })
    ).rejects.toThrow(GroupProvisioningError);
    expect(prisma.documentGroup.create).not.toHaveBeenCalled();
  });

  test('shuffles only when asked, and deterministically under a fixed source', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      class: {
        students: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }, { id: 'm4' }],
      },
      documentGroups: [],
    });

    await arrangeGroups({
      classAssignmentId: 'ca-1',
      groupSize: 2,
      shuffle: true,
      random: () => 0,
    });

    const placed = prisma.documentGroup.create.mock.calls
      .flatMap((call: any) => call[0].data.members.create)
      .map((member: any) => member.membershipId);

    // Every student still placed exactly once, just in a different order.
    expect([...placed].sort()).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(placed).not.toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  test('a whole-class arrangement is a single group', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      class: { students: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }] },
      documentGroups: [],
    });

    const result = await arrangeGroups({
      classAssignmentId: 'ca-1',
      groupSize: null,
    });

    expect(result.groupCount).toBe(1);
    expect(
      prisma.documentGroup.create.mock.calls[0][0].data.members.create
    ).toHaveLength(3);
  });

  test('throws when the class assignment does not exist', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(null);
    await expect(
      arrangeGroups({ classAssignmentId: 'missing', groupSize: 2 })
    ).rejects.toThrow(GroupProvisioningError);
  });
});

describe('openGroups', () => {
  beforeEach(() => {
    prisma.classAssignment.findUnique.mockReset();
    createAssignmentGroupArtifact.mockReset();
    let counter = 0;
    createAssignmentGroupArtifact.mockImplementation(async () => {
      counter += 1;
      return { documentId: `doc-${counter}`, created: true };
    });
  });

  test('provisions one document per group and stamps openedAt', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups([
        {
          id: 'g-1',
          documentId: null,
          openedAt: null,
          members: [{ membershipId: 'm1' }, { membershipId: 'm2' }],
        },
        {
          id: 'g-2',
          documentId: null,
          openedAt: null,
          members: [{ membershipId: 'm3' }],
        },
      ])
    );

    const result = await openGroups({ classAssignmentId: 'ca-1' });

    expect(result.provisioned).toBe(2);
    expect(createAssignmentGroupArtifact).toHaveBeenCalledTimes(2);
    expect(createAssignmentGroupArtifact.mock.calls[0][0]).toEqual({
      groupId: 'g-1',
    });
  });

  test('is idempotent: a group that already has a draft is untouched', async () => {
    // The important one. Re-provisioning would replace the document the students
    // have been writing in.
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups([
        {
          id: 'g-1',
          documentId: 'existing-doc',
          openedAt: new Date('2026-08-17'),
          members: [{ membershipId: 'm1' }],
        },
        {
          id: 'g-2',
          documentId: null,
          openedAt: null,
          members: [{ membershipId: 'm2' }],
        },
      ])
    );

    const result = await openGroups({ classAssignmentId: 'ca-1' });

    expect(result.provisioned).toBe(1);
    expect(createAssignmentGroupArtifact).toHaveBeenCalledTimes(1);
    expect(createAssignmentGroupArtifact).toHaveBeenCalledWith({
      groupId: 'g-2',
    });
  });

  test('does not assign any group member as the document owner', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups([
        {
          id: 'g-1',
          documentId: null,
          openedAt: null,
          members: [{ membershipId: 'm2' }, { membershipId: 'm9' }],
        },
      ])
    );

    await openGroups({ classAssignmentId: 'ca-1' });

    expect(createAssignmentGroupArtifact).toHaveBeenCalledWith({
      groupId: 'g-1',
    });
  });

  test('does not count a group when another request already claimed it', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups([
        {
          id: 'g-1',
          documentId: null,
          openedAt: null,
          members: [{ membershipId: 'm1' }],
        },
      ])
    );
    createAssignmentGroupArtifact.mockResolvedValue({
      documentId: 'winner-doc',
      created: false,
    });

    const result = await openGroups({ classAssignmentId: 'ca-1' });

    expect(result.provisioned).toBe(0);
    expect(createAssignmentGroupArtifact).toHaveBeenCalledTimes(1);
  });

  test('skips a group with no active members', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups([
        { id: 'g-1', documentId: null, openedAt: null, members: [] },
      ])
    );

    const result = await openGroups({ classAssignmentId: 'ca-1' });

    expect(result.provisioned).toBe(0);
    expect(createAssignmentGroupArtifact).not.toHaveBeenCalled();
  });

  test('refuses when the assignment is not collaborative', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups(
        [
          {
            id: 'g-1',
            documentId: null,
            openedAt: null,
            members: [{ membershipId: 'm1' }],
          },
        ],
        { collaborationEnabled: false }
      )
    );

    await expect(openGroups({ classAssignmentId: 'ca-1' })).rejects.toThrow(
      GroupProvisioningError
    );
    expect(createAssignmentGroupArtifact).not.toHaveBeenCalled();
  });

  test('refuses when no groups have been arranged', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups([])
    );

    await expect(openGroups({ classAssignmentId: 'ca-1' })).rejects.toThrow(
      /Arrange groups/
    );
  });

  test('refuses to finalize while any enrolled student is unassigned', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups(
        [
          {
            id: 'g-1',
            documentId: null,
            openedAt: null,
            members: [{ membershipId: 'm1' }],
          },
        ],
        { roster: ['m1', 'm2'] }
      )
    );

    await expect(openGroups({ classAssignmentId: 'ca-1' })).rejects.toThrow(
      /every enrolled student to exactly one group/i
    );
    expect(createAssignmentGroupArtifact).not.toHaveBeenCalled();
  });

  test('refuses to finalize when a student appears in two groups', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue(
      classAssignmentWithGroups(
        [
          {
            id: 'g-1',
            documentId: null,
            openedAt: null,
            members: [{ membershipId: 'm1' }],
          },
          {
            id: 'g-2',
            documentId: null,
            openedAt: null,
            members: [{ membershipId: 'm1' }],
          },
        ],
        { roster: ['m1'] }
      )
    );

    await expect(openGroups({ classAssignmentId: 'ca-1' })).rejects.toThrow(
      /every enrolled student to exactly one group/i
    );
    expect(createAssignmentGroupArtifact).not.toHaveBeenCalled();
  });
});

describe('findStudentGroupDocument', () => {
  beforeEach(() => {
    prisma.documentGroup.findFirst.mockReset();
  });

  test('returns the document of the student’s opened group', async () => {
    prisma.documentGroup.findFirst.mockResolvedValue({
      id: 'g-1',
      documentId: 'doc-7',
    });

    await expect(
      findStudentGroupDocument({
        classAssignmentId: 'ca-1',
        membershipId: 'm1',
      })
    ).resolves.toEqual({ documentId: 'doc-7' });
  });

  test('only matches an opened group the student is actively in', async () => {
    prisma.documentGroup.findFirst.mockResolvedValue(null);

    await findStudentGroupDocument({
      classAssignmentId: 'ca-1',
      membershipId: 'm1',
    });

    const where = prisma.documentGroup.findFirst.mock.calls[0][0].where;
    expect(where.openedAt).toEqual({ not: null });
    expect(where.documentId).toEqual({ not: null });
    expect(where.members).toEqual({
      some: { membershipId: 'm1', removedAt: null },
    });
  });

  test('returns null when the student is in no group', async () => {
    prisma.documentGroup.findFirst.mockResolvedValue(null);

    await expect(
      findStudentGroupDocument({
        classAssignmentId: 'ca-1',
        membershipId: 'm1',
      })
    ).resolves.toBeNull();
  });
});
