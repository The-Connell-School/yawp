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
const requireProfile = mock();
const isDocumentSubmissionEnabledForScope = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForScope,
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
    prisma.submission.create.mockReset();
    prisma.documentWriteJournal.create.mockReset();
    prisma.documentWriteJournal.update.mockReset();
    prisma.$transaction.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    isDocumentSubmissionEnabledForScope.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({ id: 'profile-1' });
    prisma.user.findUnique.mockResolvedValue({ isAdmin: false });
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submissions: [],
      revision: 4,
      assignment: null,
      studentProfile: {
        classes: [
          {
            id: 'class-1',
            schoolId: 'school-1',
            teachers: [{ id: 'teacher-1' }],
          },
        ],
      },
    });
    isDocumentSubmissionEnabledForScope.mockResolvedValue(true);
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
    expect(isDocumentSubmissionEnabledForScope).toHaveBeenCalledWith({
      schoolIds: ['school-1'],
      classIds: ['class-1'],
      teacherProfileIds: ['teacher-1'],
      classScopes: [
        {
          schoolId: 'school-1',
          classId: 'class-1',
          teacherProfileIds: ['teacher-1'],
        },
      ],
    });
  });

  test('prefers the assignment class school when the document is assignment-backed', async () => {
    prisma.document.findFirst.mockResolvedValueOnce({
      id: 'doc-1',
      html: '<p>Draft</p>',
      text: 'Draft',
      title: 'Essay',
      submissions: [],
      revision: 4,
      assignment: {
        class: {
          id: 'assignment-class',
          schoolId: 'assignment-school',
          teachers: [{ id: 'assignment-teacher' }],
        },
      },
      studentProfile: {
        classes: [{ id: 'student-class', schoolId: 'student-school' }],
      },
    });

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
    expect(isDocumentSubmissionEnabledForScope).toHaveBeenCalledWith({
      schoolIds: ['assignment-school'],
      classIds: ['assignment-class'],
      teacherProfileIds: ['assignment-teacher'],
      classScopes: [
        {
          schoolId: 'assignment-school',
          classId: 'assignment-class',
          teacherProfileIds: ['assignment-teacher'],
        },
      ],
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
