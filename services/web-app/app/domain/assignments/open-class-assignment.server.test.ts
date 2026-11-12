import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findUnique: mock() },
  document: { findFirst: mock() },
};

const createDocumentForAssignmentType = mock();
const findStudentGroupDocument = mock();
const recordClassAssignmentFirstOpen = mock();
const actualDocuments =
  globalThis.__realModules['~/domain/documents.server'];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/documents.server', () => ({
  ...actualDocuments,
  createDocumentForAssignmentType,
}));
const actualGroups = globalThis.__realModules[
  '~/domain/collaboration/groups.server'
];
mock.module('~/domain/collaboration/groups.server', () => ({
  ...actualGroups,
  findStudentGroupDocument,
}));
mock.module('~/domain/student-class-assignment-first-open.server', () => ({
  recordClassAssignmentFirstOpen,
}));

const {
  openClassAssignmentForStudent,
  openExistingClassAssignmentForStudent,
} = await import('./open-class-assignment.server');

afterAll(() => {
  mock.restore();
  mock.module('~/domain/collaboration/groups.server', () => actualGroups);
});

describe('openClassAssignmentForStudent', () => {
  beforeEach(() => {
    prisma.classAssignment.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    createDocumentForAssignmentType.mockReset();
    findStudentGroupDocument.mockReset();
    recordClassAssignmentFirstOpen.mockReset();
  });

  test('returns a solo document URL and records first open', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      assignmentId: 'a-1',
      assignment: { assignmentTypeId: 'at-1', collaborationEnabled: false },
    });
    createDocumentForAssignmentType.mockResolvedValue({ documentId: 'doc-1' });

    const result = await openClassAssignmentForStudent({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });

    expect(result).toEqual({
      ok: true,
      url: '/app/documents/doc-1?spa=1&exitTo=%2Fapp%3Ftab%3Dassignments',
    });
    expect(recordClassAssignmentFirstOpen).toHaveBeenCalledWith({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });
  });

  test('returns the collab document URL when groups exist', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      assignmentId: 'a-1',
      assignment: { assignmentTypeId: 'at-1', collaborationEnabled: true },
    });
    findStudentGroupDocument.mockResolvedValue({ documentId: 'doc-group' });

    const result = await openClassAssignmentForStudent({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('/app/collab-documents/doc-group');
    }
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('maps DocumentCreationError to sanitized client text', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      assignmentId: 'a-1',
      assignment: { assignmentTypeId: 'at-1', collaborationEnabled: false },
    });
    const { DocumentCreationError } = actualDocuments as {
      DocumentCreationError: new (message: string) => Error;
    };
    createDocumentForAssignmentType.mockRejectedValue(
      new DocumentCreationError('ClassAssignment ca-secret not found')
    );

    const result = await openClassAssignmentForStudent({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'creation-failed',
      message: 'Could not start this assignment.',
    });
    expect(result.ok === false && result.message).not.toContain('ca-secret');
  });

  test('returns groups-not-open when collaboration has no group document', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      assignmentId: 'a-1',
      assignment: { assignmentTypeId: 'at-1', collaborationEnabled: true },
    });
    findStudentGroupDocument.mockResolvedValue(null);

    const result = await openClassAssignmentForStudent({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'groups-not-open',
      message: 'Your teacher has not opened groups for this assignment yet.',
    });
  });

  test('read-only path returns an existing solo document without creating', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      id: 'ca-1',
      assignmentId: 'a-1',
      assignment: { collaborationEnabled: false },
    });
    prisma.document.findFirst.mockResolvedValue({ id: 'doc-existing' });

    const result = await openExistingClassAssignmentForStudent({
      classAssignmentId: 'ca-1',
      membershipId: 'member-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.url).toContain('/app/documents/doc-existing');
    }
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
    expect(recordClassAssignmentFirstOpen).not.toHaveBeenCalled();
  });
});
