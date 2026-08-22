import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
  },
  document: {
    findFirst: mock(),
  },
  submission: {
    create: mock(),
  },
  documentWriteJournal: {
    create: mock(),
    update: mock(),
  },
  $transaction: mock(),
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (to: string, payload: unknown) =>
    new Response(JSON.stringify({ to, payload }), {
      status: 302,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

const { action } = await import('./route');

/** What each of the two document reads answers with. */
let soloDocument: any = null;
let collaborationRoom: { id: string } | null = null;

describe('api.domain.submit-document', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.submission.create.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    prisma.$transaction.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'profile-1',
      role: 'STUDENT',
      isOrgOwner: false,
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    // Two document reads now: the route's own, and the collaboration-room probe
    // that keeps a group's shared draft off this path. Only the probe filters on
    // `group`, which is what tells them apart here.
    prisma.document.findFirst.mockImplementation(async (args: any) =>
      args?.where?.group ? collaborationRoom : soloDocument
    );
    collaborationRoom = null;
    soloDocument = {
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submissions: [],
      revision: 4,
      classAssignment: null,
      membership: {
        classesAsStudent: [
          {
            id: 'class-1',
            schoolId: 'school-1',
            school: { organizationId: 'org-1' },
            teachers: [{ id: 'teacher-1' }],
          },
        ],
      },
    };
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        submission: {
          create: mock().mockResolvedValue({ id: 'sub-1' }),
        },
        document: {
          update: mock().mockResolvedValue({
            id: 'doc-1',
            revision: 4,
          }),
        },
      };

      return callback(tx);
    });
  });

  test('creates a submission and updates the document', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      data: {
        success: boolean;
      };
    };

    expect(response.data.success).toBe(true);
  });

  test('records a document submit journal entry with the full document payload', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as {
      data: {
        success: boolean;
      };
    };

    expect(response.data.success).toBe(true);
    expect(prisma.documentWriteJournal.create).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.create.mock.calls[0]?.[0]).toMatchObject(
      {
        data: {
          eventType: 'document.submit',
          source: 'submit-document',
          status: 'pending',
          documentId: 'doc-1',
          title: 'Essay',
          html: '<p>Draft</p>',
          text: 'Draft',
          baseRevision: 4,
        },
      }
    );
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      {
        where: { id: 'journal-1' },
        data: {
          status: 'accepted',
          resultingRevision: 4,
        },
      }
    );
  });

  test('refuses a shared draft: those are submitted by the whole group', async () => {
    // This endpoint scopes to the document's owner, and a group draft has one.
    // Left open, that student could hand the group's work in alone — the exact
    // thing the group submit flow exists to prevent.
    collaborationRoom = { id: 'doc-1' };

    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response: any = await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {},
    } as any);

    const body = await response.json();
    expect(body.to).toBe('/app/collab-documents/doc-1');
    expect(body.payload.description).toMatch(/everyone in your group/i);
    expect(prisma.documentWriteJournal.create).not.toHaveBeenCalled();
  });
});
