import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
  },
  document: {
    findFirst: mock(),
    updateMany: mock(),
    findUniqueOrThrow: mock(),
  },
  submission: {
    create: mock(),
  },
  documentWriteJournal: {
    create: mock(),
    update: mock(),
  },
  submissionActivity: { create: mock() },
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

describe('api.domain.submit-document', () => {
  beforeEach(() => {
    prisma.user.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.document.updateMany.mockReset();
    prisma.document.findUniqueOrThrow.mockReset();
    prisma.submission.create.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    prisma.submissionActivity.create.mockReset();
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
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submissions: [],
      revision: 4,
      updatedAt: new Date('2026-08-20T11:59:00.000Z'),
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
    });
    prisma.documentWriteJournal.create.mockResolvedValue({ id: 'journal-1' });
    prisma.documentWriteJournal.update.mockResolvedValue({
      id: 'journal-1',
      status: 'accepted',
    });
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    prisma.document.findUniqueOrThrow.mockResolvedValue({
      id: 'doc-1',
      revision: 4,
    });
    prisma.submission.create.mockResolvedValue({
      id: 'sub-1',
      title: 'Essay',
      submittedAt: new Date('2026-08-20T12:00:00.000Z'),
    });
    prisma.$transaction.mockImplementation(async (callback: any) => {
      const tx = {
        user: prisma.user,
        submission: prisma.submission,
        document: prisma.document,
        documentWriteJournal: prisma.documentWriteJournal,
        submissionActivity: prisma.submissionActivity,
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
    expect(prisma.submissionActivity.create).toHaveBeenCalledTimes(1);
    const activity = prisma.submissionActivity.create.mock.calls[0][0].data;
    expect(activity).toEqual(
      expect.objectContaining({
        submissionId: 'sub-1',
        organizationId: 'org-1',
        actorMembershipId: 'profile-1',
        eventType: 'submission.created',
        occurredAfterRelease: false,
      })
    );
    expect(JSON.stringify(activity.metadata)).not.toContain('Draft');
  });

  test('fails closed when the required submission audit write is unavailable', async () => {
    const previous = process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
    process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = 'false';
    const form = new FormData();
    form.append('documentId', 'doc-1');

    try {
      await expect(
        action({
          request: new Request(
            'https://example.com/api/domain/submit-document',
            { method: 'POST', body: form }
          ),
        } as any)
      ).rejects.toThrow(
        'Submission activity recording is temporarily unavailable'
      );
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) {
        delete process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED;
      } else {
        process.env.SUBMISSION_ACTIVITY_WRITES_ENABLED = previous;
      }
    }
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

  test('rolls back the protected submit when journal acceptance fails', async () => {
    prisma.documentWriteJournal.update
      .mockRejectedValueOnce(new Error('journal acceptance unavailable'))
      .mockResolvedValueOnce({ id: 'journal-1', status: 'rejected' });
    const form = new FormData();
    form.append('documentId', 'doc-1');

    await expect(
      action({
        request: new Request('https://example.com/api/domain/submit-document', {
          method: 'POST',
          body: form,
        }),
      } as any)
    ).rejects.toThrow('journal acceptance unavailable');

    expect(prisma.documentWriteJournal.update).toHaveBeenCalledTimes(2);
    expect(prisma.documentWriteJournal.update.mock.calls[0]?.[0]).toMatchObject(
      { data: { status: 'accepted' } }
    );
    expect(prisma.documentWriteJournal.update.mock.calls[1]?.[0]).toMatchObject(
      {
        data: {
          status: 'rejected',
          failureReason: 'journal acceptance unavailable',
        },
      }
    );
  });

  test('returns 409 with no submission or activity when access changes before commit', async () => {
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.append('documentId', 'doc-1');

    const response = (await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any)) as { data: { success: boolean }; init?: { status?: number } };

    expect(response.init?.status).toBe(409);
    expect(prisma.submission.create).not.toHaveBeenCalled();
    expect(prisma.submissionActivity.create).not.toHaveBeenCalled();
    expect(
      prisma.documentWriteJournal.update.mock.calls.at(-1)?.[0]
    ).toMatchObject({
      data: { status: 'rejected' },
    });
  });

  test('uses updatedAt as the active-submission concurrency token', async () => {
    const form = new FormData();
    form.append('documentId', 'doc-1');

    await action({
      request: new Request('https://example.com/api/domain/submit-document', {
        method: 'POST',
        body: form,
      }),
    } as any);

    expect(prisma.document.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      revision: 4,
      updatedAt: new Date('2026-08-20T11:59:00.000Z'),
    });
  });
});
