import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentModuleSession: {
    findMany: mock(),
    findFirst: mock(),
    updateMany: mock(),
  },
  assignmentModule: { findMany: mock() },
  document: { update: mock() },
};
const buildAssignmentModuleSessionCreateData = mock();

const actualDocuments = globalThis.__realModules['~/domain/documents.server'];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/documents.server', () => ({
  ...actualDocuments,
  buildAssignmentModuleSessionCreateData,
}));

const { ensureMemberModuleSessions, memberSessionWhere } =
  await import('./tutor.server');

afterAll(() => {
  mock.restore();
  mock.module('~/domain/documents.server', () => actualDocuments);
});

describe('memberSessionWhere', () => {
  test('a solo document keeps matching its null-membership sessions', () => {
    // Every session written before shared drafts has a null membershipId,
    // meaning "the document's owner". Requiring an exact match would hide all
    // of them and wipe out every existing student's tutor history.
    expect(
      memberSessionWhere({ membershipId: 'member-1', isShared: false })
    ).toEqual({ membershipId: null });
  });

  test('a shared draft scopes to exactly this member', () => {
    expect(
      memberSessionWhere({ membershipId: 'member-1', isShared: true })
    ).toEqual({ membershipId: 'member-1' });
  });
});

describe('ensureMemberModuleSessions', () => {
  beforeEach(() => {
    prisma.assignmentModuleSession.findMany.mockReset().mockResolvedValue([]);
    prisma.assignmentModuleSession.updateMany
      .mockReset()
      .mockResolvedValue({ count: 0 });
    prisma.assignmentModule.findMany.mockReset().mockResolvedValue([
      { id: 'module-1', instructions: [{ id: 'i-1', prompt: 'Start here' }] },
      { id: 'module-2', instructions: [] },
    ]);
    prisma.document.update.mockReset().mockResolvedValue({});
    buildAssignmentModuleSessionCreateData
      .mockReset()
      .mockImplementation((modules: any[]) =>
        modules.map((m) => ({
          assignmentModuleId: m.id,
          instructionsCompleted: 0,
        }))
      );
  });

  const ensure = (overrides = {}) =>
    ensureMemberModuleSessions({
      documentId: 'doc-1',
      assignmentTypeId: 'at-1',
      membershipId: 'member-2',
      ...overrides,
    });

  test('creates a session per module, stamped with the member', async () => {
    // Without the stamp these would read as the owner's sessions and the second
    // student would be talking into the first student's transcript.
    const created = await ensure();

    expect(created).toBe(true);
    const data =
      prisma.document.update.mock.calls[0][0].data.assignmentModuleSessions
        .create;
    expect(data).toHaveLength(2);
    expect(data.every((row: any) => row.membershipId === 'member-2')).toBe(
      true
    );
  });

  test('does nothing when this member already has every module', async () => {
    prisma.assignmentModuleSession.findMany.mockResolvedValue([
      { assignmentModuleId: 'module-1' },
      { assignmentModuleId: 'module-2' },
    ]);

    await expect(ensure()).resolves.toBe(false);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  test('backfills only the modules this member is missing', async () => {
    // A module added to the assignment type after the group started writing.
    prisma.assignmentModuleSession.findMany.mockResolvedValue([
      { assignmentModuleId: 'module-1' },
    ]);

    await ensure();

    const data =
      prisma.document.update.mock.calls[0][0].data.assignmentModuleSessions
        .create;
    expect(data).toHaveLength(1);
    expect(data[0].assignmentModuleId).toBe('module-2');
  });

  test('looks only at this member’s sessions when deciding what is missing', async () => {
    // The owner's sessions must not count as this member's, or the second
    // student gets no transcript at all.
    await ensure();

    expect(
      prisma.assignmentModuleSession.findMany.mock.calls[0][0].where
    ).toEqual({
      documentId: 'doc-1',
      membershipId: 'member-2',
      deletedAt: null,
    });
  });

  test('an assignment type with no modules creates nothing', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([]);

    await expect(ensure()).resolves.toBe(false);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  test('a concurrent provisioner that loses the uniqueness race is idempotent', async () => {
    prisma.document.update.mockRejectedValue({ code: 'P2002' });
    await expect(ensure()).resolves.toBe(false);
  });
});

describe('ensureMemberModuleSessions on an assignment-owned artifact', () => {
  beforeEach(() => {
    prisma.assignmentModuleSession.findMany
      .mockReset()
      .mockResolvedValue([
        { assignmentModuleId: 'module-1' },
        { assignmentModuleId: 'module-2' },
      ]);
    prisma.assignmentModule.findMany.mockReset().mockResolvedValue([
      { id: 'module-1', instructions: [] },
      { id: 'module-2', instructions: [] },
    ]);
    prisma.assignmentModuleSession.updateMany
      .mockReset()
      .mockResolvedValue({ count: 2 });
    prisma.document.update.mockReset().mockResolvedValue({});
  });

  const ensureFor = (membershipId: string) =>
    ensureMemberModuleSessions({
      documentId: 'doc-1',
      assignmentTypeId: 'at-1',
      membershipId,
    });

  test('an assignment-owned shared artifact never adopts a nominal owner transcript', async () => {
    await ensureFor('member-1');

    expect(prisma.assignmentModuleSession.updateMany).not.toHaveBeenCalled();
  });

  test('a classmate never inherits another member’s conversation', async () => {
    await ensureFor('member-2');

    expect(prisma.assignmentModuleSession.updateMany).not.toHaveBeenCalled();
  });
});
