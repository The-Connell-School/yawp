import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  $queryRaw: mock(),
  class: { findMany: mock() },
  documentClassForensic: { findMany: mock() },
  document: { findFirst: mock() },
  pasteAlert: { findMany: mock(), findFirst: mock(), updateMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { loader, action } = await import('./route');

function reviewRequest(alertId: string) {
  const formData = new FormData();
  formData.append('alertId', alertId);
  return new Request('https://example.test/api/paste-alerts/doc-1', {
    method: 'POST',
    body: formData,
  });
}

describe('api.paste-alerts.$documentId', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      if (typeof model === 'function') {
        model.mockReset();
        continue;
      }
      for (const fn of Object.values(model)) {
        fn.mockReset();
      }
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: {
        id: 'org-1',
        name: 'Org',
        pasteActivityEnabled: true,
      },
    });
    prisma.class.findMany.mockResolvedValue([{ id: 'class-1' }]);
    prisma.documentClassForensic.findMany.mockResolvedValue([]);
    prisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      title: 'Essay',
      membership: { user: { name: 'Student One', email: 's@example.test' } },
    });
    prisma.pasteAlert.findMany.mockResolvedValue([
      {
        id: 'alert-1',
        createdAt: new Date('2026-07-01T00:00:00Z'),
        textLength: 400,
        content: 'pasted text',
        reviewedAt: null,
        reviewedByMembership: null,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'alert-1',
        content: 'pasted text',
        contentTruncated: false,
      },
    ]);
    prisma.pasteAlert.findFirst.mockResolvedValue({ id: 'alert-1' });
    prisma.pasteAlert.updateMany.mockResolvedValue({ count: 1 });
  });

  test('returns bounded alert details for an authorized document', async () => {
    const response = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((response as any).data.document.id).toBe('doc-1');
    expect((response as any).data.alerts).toHaveLength(1);
    expect(prisma.pasteAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId: 'doc-1' },
        take: 201,
      })
    );
    expect(
      prisma.pasteAlert.findMany.mock.calls[0][0].select
    ).not.toHaveProperty('content');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect((response as any).data.pageCursor).toBe(null);
    expect((response as any).data.nextCursor).toBe(null);
    expect((response as any).data.hasMore).toBe(false);
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teachers: { some: { id: 'teacher-1' } },
          school: { organizationId: 'org-1' },
        },
      })
    );
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'doc-1',
          membership: { organizationId: 'org-1' },
        }),
      })
    );
  });

  test('keeps paste details available on archived teacher-owned class pages', async () => {
    prisma.class.findMany.mockResolvedValue([
      { id: 'class-1', isArchived: true },
    ]);

    const response = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((response as any).data.document.id).toBe('doc-1');
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teachers: { some: { id: 'teacher-1' } },
          school: { organizationId: 'org-1' },
        },
      })
    );
  });

  test('bounds the response and reports when older alert history exists', async () => {
    prisma.pasteAlert.findMany.mockResolvedValue(
      Array.from({ length: 201 }, (_, index) => ({
        id: `alert-${index}`,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        textLength: 250,
        content: `paste ${index}`,
        reviewedAt: null,
        reviewedByMembership: null,
      }))
    );

    const response = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((response as any).data.alerts).toHaveLength(200);
    expect((response as any).data.hasMore).toBe(true);
    expect((response as any).data.nextCursor).toBe('alert-199');
  });

  test('pages to and reviews an older unreviewed alert', async () => {
    prisma.pasteAlert.findFirst.mockResolvedValue({ id: 'alert-199' });
    prisma.pasteAlert.findMany.mockResolvedValue([
      {
        id: 'alert-200',
        createdAt: new Date('2026-06-01T00:00:00Z'),
        textLength: 250,
        content: null,
        reviewedAt: null,
        reviewedByMembership: null,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'alert-200',
        content: null,
        contentTruncated: false,
      },
    ]);

    const response = await loader({
      request: new Request(
        'https://example.test/api/paste-alerts/doc-1?cursor=alert-199'
      ),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect(prisma.pasteAlert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: { id: 'alert-199' },
        skip: 1,
        take: 201,
      })
    );
    expect((response as any).data.pageCursor).toBe('alert-199');
    expect((response as any).data.alerts[0]).toMatchObject({
      id: 'alert-200',
      reviewedAt: null,
      content: null,
    });

    prisma.pasteAlert.findFirst.mockResolvedValue({ id: 'alert-200' });
    const reviewResponse = await action({
      request: reviewRequest('alert-200'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((reviewResponse as any).data.success).toBe(true);
    expect(prisma.pasteAlert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'alert-200',
          reviewedAt: null,
        }),
      })
    );
  });

  test('bounds oversized historical content in the detail payload', async () => {
    prisma.pasteAlert.findMany.mockResolvedValue([
      {
        id: 'legacy-alert',
        createdAt: new Date('2025-01-01T00:00:00Z'),
        textLength: 75_000,
        content: 'x'.repeat(75_000),
        reviewedAt: null,
        reviewedByMembership: null,
      },
    ]);
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'legacy-alert',
        content: 'x'.repeat(50_000),
        contentTruncated: true,
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((response as any).data.alerts[0].content).toHaveLength(50_000);
    expect((response as any).data.alerts[0].contentTruncated).toBe(true);
  });

  test('rejects students', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org' },
    });

    const response = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('hides detail reads and review writes while the rollout gate is off', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: {
        id: 'org-1',
        name: 'Org',
        pasteActivityEnabled: false,
      },
    });

    const readResponse = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);
    const writeResponse = await action({
      request: reviewRequest('alert-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect(readResponse.init?.status).toBe(404);
    expect(writeResponse.init?.status).toBe(404);
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
    expect(prisma.pasteAlert.updateMany).not.toHaveBeenCalled();
  });

  test('rejects a same-org teacher without class access', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await loader({
      request: new Request('https://example.test/api/paste-alerts/doc-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect(response.init?.status).toBe(404);
  });

  test('marks an alert reviewed for an authorized teacher', async () => {
    const response = await action({
      request: reviewRequest('alert-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((response as any).data.success).toBe(true);
    expect(prisma.pasteAlert.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'alert-1',
        documentId: 'doc-1',
        reviewedAt: null,
      },
      data: {
        reviewedAt: expect.any(Date),
        reviewedByMembershipId: 'teacher-1',
      },
    });
  });

  test('rejects review writes for unauthorized documents', async () => {
    prisma.document.findFirst.mockResolvedValue(null);

    const response = await action({
      request: reviewRequest('alert-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.pasteAlert.updateMany).not.toHaveBeenCalled();
  });

  test('rejects an alert id from another authorized document', async () => {
    prisma.pasteAlert.findFirst.mockResolvedValue(null);

    const response = await action({
      request: reviewRequest('alert-from-another-document'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect(response.init?.status).toBe(404);
    expect(prisma.pasteAlert.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'alert-from-another-document',
        documentId: 'doc-1',
      },
      select: { id: true },
    });
    expect(prisma.pasteAlert.updateMany).not.toHaveBeenCalled();
  });

  test('keeps the original reviewer when a reviewed alert is retried', async () => {
    prisma.pasteAlert.updateMany.mockResolvedValue({ count: 0 });

    const response = await action({
      request: reviewRequest('alert-1'),
      params: { documentId: 'doc-1' },
      context: {},
    } as any);

    expect((response as any).data.success).toBe(true);
    expect(prisma.pasteAlert.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'alert-1',
        documentId: 'doc-1',
        reviewedAt: null,
      },
      data: {
        reviewedAt: expect.any(Date),
        reviewedByMembershipId: 'teacher-1',
      },
    });
  });
});
