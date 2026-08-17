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
const redirectWithToast = mock();
class DocumentShareError extends Error {}

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
mock.module('~/utils/toast.server', () => ({ redirectWithToast }));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
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

const get = () =>
  loader({
    request: new Request('https://example.com/app/shared-drafts/new'),
    params: {},
  } as any);

async function readBody(response: any) {
  return typeof response.json === 'function' ? response.json() : response.data;
}

const sharingStudent = (enabled = true) => ({
  id: 'member-me',
  organization: { studentDocumentSharingEnabled: enabled },
});

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
    redirectWithToast
      .mockReset()
      .mockImplementation((to: string, options: any) => ({ to, options }));
  });

  describe('gate', () => {
    test('the loader 404s when the school has not enabled sharing', async () => {
      prisma.orgMembership.findFirst.mockResolvedValue(sharingStudent(false));

      await expect(get()).rejects.toBeDefined();
    });

    test('the loader 404s for a teacher', async () => {
      // The scoped query filters on role STUDENT, so a teacher misses.
      prisma.orgMembership.findFirst.mockResolvedValue(null);

      await expect(get()).rejects.toBeDefined();
    });

    test('the action refuses when sharing is not enabled', async () => {
      prisma.orgMembership.findFirst.mockResolvedValue(sharingStudent(false));

      const result: any = await post({ intent: 'create' });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
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
      expect(seedGroupRoomIfEmpty).toHaveBeenCalledWith({ groupId: 'group-2' });
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

    test('refuses an assignment type the student does not already write in', async () => {
      // Guards a crafted POST reaching a type outside their school's setup.
      prisma.document.findFirst.mockResolvedValue(null);

      const result: any = await post({
        intent: 'create',
        assignmentTypeId: 'at-forbidden',
        classmateIds: ['member-mate'],
      });

      expect(createSharedDocument).not.toHaveBeenCalled();
      expect(result.options.type).toBe('error');
      expect(result.options.description).toMatch(/not available to you/i);
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
