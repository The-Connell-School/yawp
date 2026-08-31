import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  orgMembership: { findFirst: mock() },
  document: { findMany: mock(), findFirst: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const listShareableClassmates = mock();
const createSharedDocument = mock();
const shareDocumentCopy = mock();
const seedGroupRoomIfEmpty = mock();
const getAvailableAssignmentTypesForScopes = mock();
const resolveSchoolYearScopeForMembership = mock();
const studentAssignmentTypeScopes = mock();
const redirectWithToast = mock();
class DocumentShareError extends Error {}

// bun's module mocks are global to the test run and mock.restore() does not
// undo mock.module — restore from the pristine copies test-preload.ts captured
// before any file could mock.module() these paths (see comment there).
const actualAssignmentTypeAccess = globalThis.__realModules[
  '~/utils/assignment-type-access.server'
];
const actualSchoolYearScope = globalThis.__realModules[
  '~/utils/school-year-scope.server'
];
const actualStudentScopes = globalThis.__realModules[
  '~/utils/student-assignment-type-scopes.server'
];
const actualCollaboration = globalThis.__realModules[
  '~/domain/assignments/collaboration'
];

// The pedagogical gate, stubbed so both of its branches are exercised. Every
// test below except the `student group-making is hidden` block runs with the
// road open, which is what the rest of this file is about: the machinery is
// still here and still has to work when a teacher asks for it back.
const studentStartedSharedDraftsEnabled = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/domain/collaboration/share.server', () => ({
  listShareableClassmates,
  createSharedDocument,
  shareDocumentCopy,
  DocumentShareError,
}));
mock.module('~/domain/collaboration/seed.server', () => ({
  seedGroupRoomIfEmpty,
}));
mock.module('~/domain/collaboration/room-store.server', () => ({
  localRoomClient: () => ({ getState: async () => null, putState: async () => {} }),
}));
mock.module('~/utils/assignment-type-access.server', () => ({
  ...actualAssignmentTypeAccess,
  getAvailableAssignmentTypesForScopes,
}));
mock.module('~/utils/school-year-scope.server', () => ({
  ...actualSchoolYearScope,
  resolveSchoolYearScopeForMembership,
}));
mock.module('~/utils/student-assignment-type-scopes.server', () => ({
  ...actualStudentScopes,
  studentAssignmentTypeScopes,
}));
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));
mock.module('~/domain/assignments/collaboration', () => ({
  ...actualCollaboration,
  studentStartedSharedDraftsEnabled,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
  mock.module(
    '~/utils/assignment-type-access.server',
    () => actualAssignmentTypeAccess
  );
  mock.module('~/utils/school-year-scope.server', () => actualSchoolYearScope);
  mock.module(
    '~/utils/student-assignment-type-scopes.server',
    () => actualStudentScopes
  );
  mock.module('~/domain/assignments/collaboration', () => actualCollaboration);
});

const post = (fields: Record<string, string | string[]>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      form.append(key, item);
    }
  }
  return action({
    request: new Request('https://example.com/app/shared-drafts/new', {
      method: 'POST',
      body: form,
    }),
    params: {},
  } as any);
};

const get = (search = '') =>
  loader({
    request: new Request(`https://example.com/app/shared-drafts/new${search}`),
    params: {},
  } as any);

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

const sharingStudent = () => ({ id: 'member-me' });

const draftRow = {
  id: 'doc-source',
  title: 'My draft',
  updatedAt: new Date('2026-08-17T10:00:00Z'),
  assignmentTypeId: 'at-1',
  assignmentType: { title: 'Essay' },
};

describe('app.shared-drafts.new', () => {
  beforeEach(() => {
    requireUserId.mockReset().mockResolvedValue('user-1');
    requireMembership.mockReset().mockResolvedValue({
      id: 'member-me',
      role: 'STUDENT',
    });
    prisma.orgMembership.findFirst.mockReset().mockResolvedValue(sharingStudent());
    prisma.document.findMany.mockReset().mockResolvedValue([draftRow]);
    prisma.document.findFirst.mockReset().mockResolvedValue({ id: 'doc-source' });
    listShareableClassmates
      .mockReset()
      .mockResolvedValue([{ membershipId: 'member-mate', name: 'Devon K.' }]);
    createSharedDocument
      .mockReset()
      .mockResolvedValue({ documentId: 'doc-new', groupId: 'group-1' });
    shareDocumentCopy.mockReset().mockResolvedValue({
      documentId: 'doc-copy',
      groupId: 'group-2',
      sourceDocumentId: 'doc-source',
      html: '<p>Work.</p>',
    });
    seedGroupRoomIfEmpty.mockReset().mockResolvedValue({ status: 'seeded' });
    resolveSchoolYearScopeForMembership.mockReset().mockResolvedValue('2026-2027');
    studentAssignmentTypeScopes
      .mockReset()
      .mockResolvedValue([{ organizationId: 'org-1' }]);
    getAvailableAssignmentTypesForScopes.mockReset().mockResolvedValue([
      { id: 'at-1', title: 'Essay', collaborationSupported: true },
      { id: 'at-solo', title: 'Free Write', collaborationSupported: false },
    ]);
    redirectWithToast
      .mockReset()
      .mockImplementation((to: string, options: any) => ({ to, options }));
    studentStartedSharedDraftsEnabled.mockReset().mockReturnValue(true);
  });

  describe('student group-making is hidden', () => {
    // What ships today. The road is closed at `requireSharingStudent`, which
    // both exports go through, so there is no way in through either of them —
    // and no way for them to disagree about it.
    test('the loader 404s even for an enrolled student', async () => {
      studentStartedSharedDraftsEnabled.mockReturnValue(false);

      await expect(get()).rejects.toBeDefined();
    });

    test('the loader never reaches the database', async () => {
      // Closed before the queries, so a hidden page costs nothing to refuse.
      studentStartedSharedDraftsEnabled.mockReturnValue(false);

      await expect(get()).rejects.toBeDefined();
      expect(prisma.orgMembership.findFirst).not.toHaveBeenCalled();
      expect(listShareableClassmates).not.toHaveBeenCalled();
    });

    test('the action creates nothing, however it is posted', async () => {
      // Hiding the two links is not the gate — a student who kept the URL, or
      // posts the form straight at it, gets the same answer.
      studentStartedSharedDraftsEnabled.mockReturnValue(false);

      const created: any = await post({ intent: 'create', assignmentTypeId: 'at-1' });
      const copied: any = await post({
        intent: 'share-copy',
        sourceDocumentId: 'doc-source',
      });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(shareDocumentCopy).not.toHaveBeenCalled();
      expect(created.options.type).toBe('error');
      expect(copied.options.type).toBe('error');
    });
  });

  describe('gate', () => {
    test('the loader 404s for a teacher', async () => {
      // The scoped query filters on role STUDENT, so a teacher misses.
      prisma.orgMembership.findFirst.mockResolvedValue(null);

      await expect(get()).rejects.toBeDefined();
    });

    test('the action refuses a non-student', async () => {
      prisma.orgMembership.findFirst.mockResolvedValue(null);

      const result: any = await post({ intent: 'create' });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
    });

    test('only offers drafts whose kind of writing is in the pilot', async () => {
      // Otherwise a student could open a room the collaborative page, the token
      // endpoint and the dual-write would all then refuse to serve.
      await get();

      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.assignmentType).toEqual({ collaborationSupported: true });
    });

    test('only offers kinds of writing in the pilot', async () => {
      // The full list comes from the student's classes; the pilot flag narrows it.
      const body = await readBody(await get());

      expect(body.assignmentTypes).toEqual([{ id: 'at-1', title: 'Essay' }]);
    });

    test('refuses to start a draft of a kind outside the pilot', async () => {
      const result: any = await post({
        intent: 'create',
        assignmentTypeId: 'at-solo',
        classmateIds: ['member-mate'],
      });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(result.options.description).toMatch(/not available to you/i);
    });

    test('refuses a kind of writing outside the student’s own classes', async () => {
      const result: any = await post({
        intent: 'create',
        assignmentTypeId: 'at-elsewhere',
        classmateIds: ['member-mate'],
      });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(result.options.description).toMatch(/not available to you/i);
    });
  });

  describe('loader', () => {
    test('offers classmates and the student’s own unshared drafts', async () => {
      const body = await readBody(await get());

      expect(body.classmates).toEqual([
        { membershipId: 'member-mate', name: 'Devon K.' },
      ]);
      expect(body.drafts).toEqual([
        {
          id: 'doc-source',
          title: 'My draft',
          assignmentTypeId: 'at-1',
          assignmentTypeTitle: 'Essay',
          updatedAt: '2026-08-17T10:00:00.000Z',
        },
      ]);
    });

    test('excludes drafts that already belong to a group', async () => {
      // A draft that is already shared is not a candidate for sharing again.
      await get();

      const where = prisma.document.findMany.mock.calls[0][0].where;
      expect(where.membershipId).toBe('member-me');
      expect(where.group).toBeNull();
      expect(where.deletedAt).toBeNull();
      expect(where.archivedAt).toBeNull();
    });

    test('preselects the draft the student came from', async () => {
      // Arriving from that draft's own menu, it is what they meant to share.
      const body = await readBody(await get('?sourceDocumentId=doc-source'));

      expect(body.preselectedDraftId).toBe('doc-source');
    });

    test('ignores a draft id that is not one of theirs', async () => {
      // The id comes from the URL, so it cannot be trusted to name a draft they
      // own or one in the pilot -- both of which the drafts query already
      // enforces.
      const body = await readBody(await get('?sourceDocumentId=doc-someone-else'));

      expect(body.preselectedDraftId).toBeNull();
    });

    test('falls back to Untitled for a draft with no title', async () => {
      prisma.document.findMany.mockResolvedValue([
        { ...draftRow, title: '   ' },
      ]);

      expect((await readBody(await get())).drafts[0].title).toBe('Untitled');
    });
  });

  describe('share a copy', () => {
    test('copies, seeds, and lands the student on the shared draft', async () => {
      const result: any = await post({
        intent: 'share-copy',
        sourceDocumentId: 'doc-source',
        classmateIds: ['member-mate'],
      });

      expect(shareDocumentCopy).toHaveBeenCalledWith({
        membershipId: 'member-me',
        sourceDocumentId: 'doc-source',
        inviteMembershipIds: ['member-mate'],
      });
      expect(seedGroupRoomIfEmpty).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'group-2' })
      );
      expect(result.to).toBe('/app/collab-documents/doc-copy');
      expect(result.options.type).toBe('success');
    });

    test('says the original is untouched, because that is the point of a copy', async () => {
      const result: any = await post({
        intent: 'share-copy',
        sourceDocumentId: 'doc-source',
        classmateIds: ['member-mate'],
      });

      expect(result.options.description).toMatch(/original draft is untouched/i);
    });

    test('tells the student plainly when seeding fails', async () => {
      // The draft exists and is usable but starts empty, and seededAt is left
      // unstamped so it can be retried. Silently handing over a blank page would
      // read as losing their work.
      seedGroupRoomIfEmpty.mockRejectedValue(new Error('provider down'));

      const result: any = await post({
        intent: 'share-copy',
        sourceDocumentId: 'doc-source',
        classmateIds: ['member-mate'],
      });

      expect(result.to).toBe('/app/collab-documents/doc-copy');
      expect(result.options.type).toBe('error');
      expect(result.options.description).toMatch(/could not be copied/i);
      expect(result.options.description).toMatch(/original draft is untouched/i);
    });

    test('requires a source draft', async () => {
      const result: any = await post({
        intent: 'share-copy',
        classmateIds: ['member-mate'],
      });

      expect(shareDocumentCopy).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
    });

    test('surfaces a share refusal as an error toast', async () => {
      shareDocumentCopy.mockRejectedValue(
        new DocumentShareError('You can only share with classmates from your own classes.')
      );

      const result: any = await post({
        intent: 'share-copy',
        sourceDocumentId: 'doc-source',
        classmateIds: ['member-stranger'],
      });

      expect(result.options.type).toBe('error');
      expect(result.options.description).toMatch(/only share with classmates/i);
    });
  });

  describe('create a new shared draft', () => {
    test('creates and lands the student on it, with nothing to seed', async () => {
      const result: any = await post({
        intent: 'create',
        assignmentTypeId: 'at-1',
        classmateIds: ['member-mate'],
      });

      expect(createSharedDocument).toHaveBeenCalledWith({
        membershipId: 'member-me',
        assignmentTypeId: 'at-1',
        inviteMembershipIds: ['member-mate'],
      });
      // It starts empty by construction.
      expect(seedGroupRoomIfEmpty).not.toHaveBeenCalled();
      expect(result.to).toBe('/app/collab-documents/doc-new');
    });

    test('offers a kind of writing the student has not yet written in', async () => {
      // Deriving the options from existing drafts made this road unreachable for
      // exactly the student who has not started one -- most of them, at first.
      prisma.document.findMany.mockResolvedValue([]);

      const body = await readBody(await get());

      expect(body.drafts).toEqual([]);
      expect(body.assignmentTypes).toEqual([{ id: 'at-1', title: 'Essay' }]);
    });

    test('requires an assignment type', async () => {
      const result: any = await post({
        intent: 'create',
        classmateIds: ['member-mate'],
      });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
    });
  });

  test('an unknown intent is rejected', async () => {
    const result: any = await post({ intent: 'takeover' });

    expect(createSharedDocument).not.toHaveBeenCalled();
    expect(shareDocumentCopy).not.toHaveBeenCalled();
    expect(result.options.type).toBe('error');
  });
});
