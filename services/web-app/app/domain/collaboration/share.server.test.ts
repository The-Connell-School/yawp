import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  orgMembership: { findMany: mock(), findFirst: mock() },
  assignmentType: { findFirst: mock() },
  document: { findFirst: mock(), update: mock() },
  documentGroup: { create: mock() },
};

const createDocumentForAssignmentType = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
}));

const {
  createSharedDocument,
  DocumentShareError,
  listShareableClassmates,
  shareDocumentCopy,
} = await import('./share.server');

afterAll(() => {
  mock.restore();
});

const ME = 'member-me';
const MATE = 'member-mate';
const OTHER = 'member-stranger';

const actor = ({ role = 'STUDENT' } = {}) => ({ id: ME, role });

const classmates = [
  { id: MATE, user: { name: 'Devon K.', email: 'devon@example.com' } },
];

describe('listShareableClassmates', () => {
  beforeEach(() => {
    prisma.orgMembership.findMany.mockReset().mockResolvedValue(classmates);
  });

  test('scopes to active students sharing an unarchived class', async () => {
    await listShareableClassmates({ membershipId: ME });

    const where = prisma.orgMembership.findMany.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: ME });
    expect(where.role).toBe('STUDENT');
    expect(where.isActive).toBe(true);
    expect(where.classesAsStudent).toEqual({
      some: { isArchived: false, students: { some: { id: ME } } },
    });
  });

  test('falls back to email when a classmate has no name', async () => {
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: MATE, user: { name: null, email: 'devon@example.com' } },
    ]);

    await expect(listShareableClassmates({ membershipId: ME })).resolves.toEqual([
      { membershipId: MATE, name: 'devon@example.com' },
    ]);
  });
});

describe('createSharedDocument', () => {
  beforeEach(() => {
    prisma.orgMembership.findFirst.mockReset().mockResolvedValue(actor());
    prisma.orgMembership.findMany.mockReset().mockResolvedValue(classmates);
    prisma.assignmentType.findFirst
      .mockReset()
      .mockResolvedValue({ id: 'at-1', collaborationSupported: true });
    prisma.documentGroup.create.mockReset().mockResolvedValue({
      id: 'group-1',
      documentId: 'doc-new',
    });
    createDocumentForAssignmentType
      .mockReset()
      .mockResolvedValue({ documentId: 'doc-new' });
  });

  const call = (overrides = {}) =>
    createSharedDocument({
      membershipId: ME,
      assignmentTypeId: 'at-1',
      inviteMembershipIds: [MATE],
      ...overrides,
    });

  test('creates a document and a student-share group that is open immediately', async () => {
    const result = await call();

    expect(result).toEqual({ documentId: 'doc-new', groupId: 'group-1' });

    const data = prisma.documentGroup.create.mock.calls[0][0].data;
    expect(data.kind).toBe('student-share');
    expect(data.classAssignmentId).toBeNull();
    // No seating-chart phase: the student has already chosen who is in it.
    expect(data.openedAt).toBeInstanceOf(Date);
  });

  test('includes the sharing student as a member', async () => {
    await call();

    const members = prisma.documentGroup.create.mock.calls[0][0].data.members.create;
    expect(members).toEqual([{ membershipId: ME }, { membershipId: MATE }]);
  });

  test('refuses an assignment type outside the collaboration pilot', async () => {
    // The same gate the teacher road and the transport enforce: only types with
    // collaborationSupported can become rooms.
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'at-1',
      collaborationSupported: false,
    });

    await expect(call()).rejects.toThrow(/cannot be written together/i);
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('refuses an assignment type that does not exist', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    await expect(call()).rejects.toThrow(DocumentShareError);
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('refuses a non-student actor', async () => {
    // Teachers use the assignment road; this one is for students.
    prisma.orgMembership.findFirst.mockResolvedValue(null);

    await expect(call()).rejects.toThrow(DocumentShareError);
  });

  test('refuses someone who is not a classmate', async () => {
    // The load-bearing check: an id pasted from elsewhere cannot be added.
    await expect(call({ inviteMembershipIds: [OTHER] })).rejects.toThrow(
      /only share with classmates/i
    );
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('refuses when no classmate is chosen', async () => {
    await expect(call({ inviteMembershipIds: [] })).rejects.toThrow(
      /at least one classmate/i
    );
  });

  test('ignores an attempt to invite yourself and still requires a classmate', async () => {
    await expect(call({ inviteMembershipIds: [ME] })).rejects.toThrow(
      /at least one classmate/i
    );
  });

  test('deduplicates a repeated invite', async () => {
    await call({ inviteMembershipIds: [MATE, MATE] });

    const members = prisma.documentGroup.create.mock.calls[0][0].data.members.create;
    expect(members).toEqual([{ membershipId: ME }, { membershipId: MATE }]);
  });

  test('enforces the maximum number of writers', async () => {
    const many = Array.from({ length: 9 }, (_, i) => `mate-${i}`);
    prisma.orgMembership.findMany.mockResolvedValue(
      many.map((id) => ({ id, user: { name: id, email: `${id}@x.com` } }))
    );

    await expect(call({ inviteMembershipIds: many })).rejects.toThrow(
      /at most 8 writers/i
    );
  });
});

describe('shareDocumentCopy', () => {
  beforeEach(() => {
    prisma.orgMembership.findFirst.mockReset().mockResolvedValue(actor());
    prisma.orgMembership.findMany.mockReset().mockResolvedValue(classmates);
    prisma.document.findFirst.mockReset().mockResolvedValue({
      id: 'doc-source',
      title: 'My draft',
      html: '<p>Work in progress.</p>',
      text: 'Work in progress.',
      assignmentTypeId: 'at-1',
      assignmentType: { collaborationSupported: true },
    });
    prisma.document.update.mockReset().mockResolvedValue({});
    prisma.documentGroup.create.mockReset().mockResolvedValue({
      id: 'group-2',
      documentId: 'doc-copy',
    });
    createDocumentForAssignmentType
      .mockReset()
      .mockResolvedValue({ documentId: 'doc-copy' });
  });

  const call = (overrides = {}) =>
    shareDocumentCopy({
      membershipId: ME,
      sourceDocumentId: 'doc-source',
      inviteMembershipIds: [MATE],
      ...overrides,
    });

  test('copies content into a new document and leaves the original alone', async () => {
    // A copy rather than a conversion, so the solo editor never fights the CRDT
    // over the same row.
    const result = await call();

    expect(result.documentId).toBe('doc-copy');
    expect(result.sourceDocumentId).toBe('doc-source');
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc-copy' },
      data: {
        title: 'My draft',
        html: '<p>Work in progress.</p>',
        text: 'Work in progress.',
      },
    });
    // The source row is never updated.
    expect(
      prisma.document.update.mock.calls.every(
        (call: any) => call[0].where.id !== 'doc-source'
      )
    ).toBe(true);
  });

  test('returns the html so the caller can seed the room', async () => {
    await expect(call()).resolves.toMatchObject({
      html: '<p>Work in progress.</p>',
    });
  });

  test('reuses the source document’s assignment type', async () => {
    await call();

    expect(createDocumentForAssignmentType).toHaveBeenCalledWith({
      membershipId: ME,
      assignmentTypeId: 'at-1',
    });
  });

  test('only lets a student share a draft they own', async () => {
    await call();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.membershipId).toBe(ME);
    expect(where.deletedAt).toBeNull();
  });

  test('refuses a draft that is not theirs', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(call()).rejects.toThrow(/not yours to share/i);
    expect(prisma.documentGroup.create).not.toHaveBeenCalled();
  });

  test('checks participants before touching any document', async () => {
    await expect(call({ inviteMembershipIds: [OTHER] })).rejects.toThrow(
      DocumentShareError
    );
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });

  test('copes with a source draft that has no content yet', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-source',
      title: 'Empty',
      html: null,
      text: null,
      assignmentTypeId: 'at-1',
      assignmentType: { collaborationSupported: true },
    });

    await expect(call()).resolves.toMatchObject({ html: '' });
  });

  test('refuses a draft whose kind of writing is outside the pilot', async () => {
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-source',
      title: 'Solo only',
      html: '<p>x</p>',
      text: 'x',
      assignmentTypeId: 'at-solo',
      assignmentType: { collaborationSupported: false },
    });

    await expect(call()).rejects.toThrow(/cannot be written together/i);
    expect(prisma.documentGroup.create).not.toHaveBeenCalled();
  });
});
