import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
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
      organization: { id: 'org-1', name: 'Org' },
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
        take: 200,
      })
    );
    expect(prisma.class.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          teachers: { some: { id: 'teacher-1' } },
          isArchived: false,
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
