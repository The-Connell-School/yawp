import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
  classAssignment: { findMany: mock() },
  documentClassForensic: { findMany: mock() },
  document: { findMany: mock() },
  pasteAlert: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

describe('documents loader paste activity', () => {
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

    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        grade: '9',
        period: '2',
        title: 'World History',
        school: {
          id: 'school-1',
          name: 'Tallassee High School',
          organizationId: 'org-1',
        },
      },
    ]);
    prisma.classAssignment.findMany.mockResolvedValue([]);
    prisma.documentClassForensic.findMany.mockResolvedValue([]);
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Essay Draft',
        updatedAt: new Date('2026-07-01T00:00:00Z'),
        assignment: null,
        classAssignment: { class: { id: 'class-1', grade: '9', period: '2', title: 'World History' } },
        membership: {
          id: 'membership-1',
          user: { id: 'student-1', name: 'Student One', email: 'student1@example.test' },
          classesAsStudent: [],
        },
        submissions: [],
        _count: { submissions: 0 },
      },
    ]);
    prisma.pasteAlert.findMany.mockResolvedValue([
      { documentId: 'doc-1', textLength: 400 },
      { documentId: 'doc-1', textLength: 250 },
    ]);
  });

  test('surfaces paste alert counts per document for teacher review', async () => {
    const data = await loader({
      request: new Request('https://example.test/app/documents'),
      params: {},
      context: {} as never,
    });

    expect(prisma.pasteAlert.findMany).toHaveBeenCalledWith({
      where: { documentId: { in: ['doc-1'] } },
      select: { documentId: true },
    });

    const document = data.documents.find((doc: any) => doc.id === 'doc-1');
    expect(document.pasteAlertCount).toBe(2);
  });
});
