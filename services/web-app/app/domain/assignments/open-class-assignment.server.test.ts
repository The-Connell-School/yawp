import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findUnique: mock() },
};

const createDocumentForAssignmentType = mock();
const findStudentGroupDocument = mock();
const recordClassAssignmentFirstOpen = mock();
class DocumentCreationError extends Error {}

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
  DocumentCreationError,
  documentCreationErrorTextForClient: (
    error: DocumentCreationError,
    fallback: string
  ) => error.message || fallback,
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

const { openClassAssignmentForStudent } = await import(
  './open-class-assignment.server'
);

afterAll(() => {
  mock.restore();
  mock.module('~/domain/collaboration/groups.server', () => actualGroups);
});

describe('openClassAssignmentForStudent', () => {
  beforeEach(() => {
    prisma.classAssignment.findUnique.mockReset();
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
});
