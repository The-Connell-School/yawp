import { beforeEach, describe, expect, mock, test } from 'bun:test';

const tx = {
  documentGroup: { findUnique: mock(), updateMany: mock() },
  document: { create: mock() },
};
const prisma = {
  documentGroup: { findUnique: mock() },
  $transaction: mock(),
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { createAssignmentGroupArtifact, AssignmentArtifactError } =
  globalThis.__realModules['~/domain/collaboration/assignment-artifact.server'] as typeof import('./assignment-artifact.server');

function group(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    documentId: null,
    classAssignment: {
      id: 'class-assignment-1',
      assignmentId: 'assignment-1',
      assignment: {
        assignmentTypeId: 'assignment-type-1',
        collaborationEnabled: true,
      },
    },
    members: [{ id: 'group-member-1' }, { id: 'group-member-2' }],
    ...overrides,
  };
}

describe('createAssignmentGroupArtifact', () => {
  beforeEach(() => {
    mock.module('./assignment-artifact.server', () => globalThis.__realModules['~/domain/collaboration/assignment-artifact.server']);
    tx.documentGroup.findUnique.mockReset().mockResolvedValue(group());
    tx.documentGroup.updateMany.mockReset().mockResolvedValue({ count: 1 });
    tx.document.create
      .mockReset()
      .mockResolvedValue({ id: 'shared-document-1' });
    prisma.documentGroup.findUnique.mockReset();
    prisma.$transaction
      .mockReset()
      .mockImplementation((callback: any) => callback(tx));
  });

  test('creates an assignment-owned artifact with no student owner', async () => {
    await expect(
      createAssignmentGroupArtifact({ groupId: 'group-1' })
    ).resolves.toEqual({ documentId: 'shared-document-1', created: true });

    expect(tx.document.create).toHaveBeenCalledTimes(1);
    expect(tx.document.create.mock.calls[0][0].data).toMatchObject({
      artifactKind: 'ASSIGNMENT_GROUP',
      membershipId: null,
      assignmentTypeId: 'assignment-type-1',
      assignmentId: 'assignment-1',
      classAssignmentId: 'class-assignment-1',
    });
    expect(
      tx.document.create.mock.calls[0][0].data.assignmentModuleSessions
    ).toBeUndefined();
  });

  test('never reuses a group member personal document', async () => {
    await createAssignmentGroupArtifact({ groupId: 'group-1' });

    expect(tx.document.create).toHaveBeenCalledTimes(1);
    expect(tx.document.create.mock.calls[0][0].data.membershipId).toBeNull();
    expect(tx.document.create.mock.calls[0][0].data.artifactKind).toBe(
      'ASSIGNMENT_GROUP'
    );
  });

  test('is idempotent when the group already has its artifact', async () => {
    tx.documentGroup.findUnique.mockResolvedValue(
      group({ documentId: 'existing-shared-document' })
    );

    await expect(
      createAssignmentGroupArtifact({ groupId: 'group-1' })
    ).resolves.toEqual({
      documentId: 'existing-shared-document',
      created: false,
    });
    expect(tx.document.create).not.toHaveBeenCalled();
  });

  test('rolls back a lost claim and returns the winning artifact', async () => {
    tx.documentGroup.updateMany.mockResolvedValue({ count: 0 });
    prisma.$transaction.mockImplementation(async (callback: any) => {
      try {
        return await callback(tx);
      } catch (error) {
        throw error;
      }
    });
    prisma.documentGroup.findUnique.mockResolvedValue({
      documentId: 'winning-shared-document',
    });

    await expect(
      createAssignmentGroupArtifact({ groupId: 'group-1' })
    ).resolves.toEqual({
      documentId: 'winning-shared-document',
      created: false,
    });
  });

  test('refuses empty groups', async () => {
    tx.documentGroup.findUnique.mockResolvedValue(group({ members: [] }));
    await expect(
      createAssignmentGroupArtifact({ groupId: 'group-1' })
    ).rejects.toThrow(AssignmentArtifactError);
    expect(tx.document.create).not.toHaveBeenCalled();
  });
});
