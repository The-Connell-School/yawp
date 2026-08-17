import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { document: { findFirst: mock() } };
const requireUserId = mock();
const requireMembership = mock();
const getIsPlatformAdmin = mock();
const buildContributionBreakdown = mock();

const actualDocumentAccess = globalThis.__realModules[
  '~/utils/document-access.server'
];

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/document-access.server', () => ({
  ...actualDocumentAccess,
  getIsPlatformAdmin,
}));
mock.module('~/domain/collaboration/contribution.server', () => ({
  buildContributionBreakdown,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module('~/utils/document-access.server', () => actualDocumentAccess);
});

const get = () =>
  loader({
    request: new Request('https://example.com/app/group-drafts/doc-1'),
    params: { documentId: 'doc-1' },
  } as any);

const readBody = (response: any) =>
  typeof response.json === 'function' ? response.json() : response.data;

const docRow = ({ classAssignmentId = 'ca-1' as string | null } = {}) => ({
  id: 'doc-1',
  title: 'Untitled',
  assignment: { id: 'a-1', title: 'Expansion Plan' },
  group: {
    label: 'Group 2',
    classAssignmentId,
    classAssignment: classAssignmentId ? { classId: 'class-1' } : null,
    members: [
      {
        membershipId: 'member-1',
        membership: { user: { name: 'Maya P.', email: 'maya@x.com' } },
      },
      {
        membershipId: 'member-2',
        membership: { user: { name: null, email: 'devon@x.com' } },
      },
    ],
  },
});

describe('app.group-drafts.$documentId loader', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership
      .mockReset()
      .mockResolvedValue({ id: 'teacher-1', role: 'TEACHER' });
    getIsPlatformAdmin.mockReset().mockResolvedValue(false);
    prisma.document.findFirst.mockReset().mockResolvedValue(docRow());
    buildContributionBreakdown.mockReset().mockResolvedValue({
      members: [],
      paragraphs: [],
      unattributedChars: 0,
    });
  });

  test('404s for a student', async () => {
    // A student must not see their partner's session times and character counts.
    // Their view of the draft is the collaborative editor.
    requireMembership.mockResolvedValue({ id: 'member-1', role: 'STUDENT' });

    await expect(get()).rejects.toBeDefined();
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  test('404s when the document is not this teacher’s to see', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    await expect(get()).rejects.toBeDefined();
  });

  test('only serves an opened collaborative draft', async () => {
    // collaborationRoomWhere is what keeps every solo document off this page.
    await get();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(where.group).toEqual({ is: { openedAt: { not: null } } });
    expect(where.assignmentType).toEqual({
      is: { collaborationSupported: true },
    });
  });

  test('applies the read scope alongside the room predicate', async () => {
    // Both, not either: the room predicate says "this is a group draft" and the
    // read scope says "and you are allowed to see it".
    await get();

    const where = prisma.document.findFirst.mock.calls[0][0].where;
    expect(Array.isArray(where.AND)).toBe(true);
    expect(where.AND).toHaveLength(1);
  });

  test('builds the breakdown from the group roster', async () => {
    await get();

    expect(buildContributionBreakdown).toHaveBeenCalledWith({
      documentId: 'doc-1',
      roster: [
        { membershipId: 'member-1', name: 'Maya P.' },
        // Falls back to email when a student has no name set.
        { membershipId: 'member-2', name: 'devon@x.com' },
      ],
    });
  });

  test('sends the teacher back to the groups page they came from', async () => {
    const body = await readBody(await get());

    expect(body.backTo).toBe('/app/class-assignments/ca-1/groups');
  });

  test('a student-share draft has no groups page to go back to', async () => {
    // Those belong to no class assignment, so the dashboard is the only sane
    // destination.
    prisma.document.findFirst.mockResolvedValue(
      docRow({ classAssignmentId: null })
    );

    const body = await readBody(await get());

    expect(body.backTo).toBe('/app');
  });

  test('prefers the assignment title over the document title', async () => {
    const body = await readBody(await get());

    expect(body.title).toBe('Expansion Plan');
  });

  test('a platform admin may read it without being the teacher', async () => {
    requireMembership.mockResolvedValue({ id: 'admin-1', role: 'OWNER' });
    getIsPlatformAdmin.mockResolvedValue(true);

    const body = await readBody(await get());

    expect(body.documentId).toBe('doc-1');
  });
});
