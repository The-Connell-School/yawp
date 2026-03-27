import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
  },
  document: {
    findFirst: mock(),
  },
  documentSnapshot: {
    create: mock(),
  },
  documentComment: {
    updateMany: mock(),
  },
  documentWriteJournal: {
    create: mock(),
    update: mock(),
  },
  $transaction: mock(),
};

const requireUserId = mock();
const requireProfile = mock();
const isDocumentSubmissionEnabledForSchool = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForSchool,
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast: (to: string, payload: unknown) =>
    new Response(JSON.stringify({ to, payload }), {
      status: 302,
      headers: { 'Content-Type': 'application/json' },
    }),
}));
const { action } = await import('./route');

describe('api.domain.submit-document', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.documentSnapshot.create.mockReset();
    prisma.documentComment.updateMany.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    prisma.$transaction.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    isDocumentSubmissionEnabledForSchool.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submittedAt: null,
      revision: 4,
      class: {
        schoolId: 'school-1',
      },
    });
    isDocumentSubmissionEnabledForSchool.mockResolvedValue(true);
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        documentSnapshot: {
          create: mock().mockResolvedValue({ id: 'snapshot-1' }),
        },
        documentComment: {
          updateMany: mock().mockResolvedValue({ count: 2 }),
        },
        document: {
          update: mock().mockResolvedValue({
            id: 'doc-1',
            submittedAt: new Date('2026-03-17T12:00:00.000Z'),
            submittedSnapshotId: 'snapshot-1',
            revision: 4,
          }),
        },
      };

      return callback(tx);
    });
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
    expect(prisma.documentWriteJournal.create.mock.calls[0]?.[0]).toMatchObject({
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
    });
    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(1);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'journal-1' },
      data: {
        status: 'accepted',
        resultingRevision: 4,
      },
    });
  });
});
