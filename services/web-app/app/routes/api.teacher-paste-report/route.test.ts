import { beforeEach, describe, expect, mock, test } from 'bun:test';
const actor = {
  userId: 'teacher-user',
  membershipId: 'teacher',
  organizationId: 'org',
  isTeacher: true,
  isAdmin: false,
  teacherProfileId: 'teacher',
};
const prisma = {
  document: { findFirst: mock() },
  submission: { findFirst: mock() },
  pasteAlert: { findMany: mock(), findFirst: mock() },
};
const getGradingActor = mock(async () => actor);
mock.module('~/utils/db.server', () => ({ prisma }));
// Keep the real access predicate: Bun module mocks otherwise leak a weaker
// substitute into unrelated loader tests in the full suite.
const { buildTeacherDocumentAccessWhere } = await import('~/utils/grading-auth.server');
mock.module('~/utils/grading-auth.server', () => ({
  getGradingActor,
  buildTeacherDocumentAccessWhere,
}));
const { loader } = await import('./route');
const load = (query: string) =>
  loader({
    request: new Request(`http://localhost/api/teacher-paste-report?${query}`),
  } as any);
const payload = (response: any) => response.data;
const status = (response: any) => response.init?.status ?? 200;

beforeEach(() => {
  getGradingActor.mockResolvedValue(actor);
  for (const obj of Object.values(prisma))
    for (const fn of Object.values(obj)) fn.mockReset();
  prisma.document.findFirst.mockResolvedValue({ id: 'doc' });
  prisma.submission.findFirst.mockResolvedValue({
    documentId: 'doc',
    submittedAt: new Date('2026-01-01'),
    html: '',
  });
  prisma.pasteAlert.findMany.mockResolvedValue([]);
  prisma.pasteAlert.findFirst.mockResolvedValue(null);
});
describe('teacher paste report authorization and snapshot boundary', () => {
  test('owner students, even with known IDs, never query or receive events', async () => {
    getGradingActor.mockResolvedValue({
      ...actor,
      isTeacher: false,
      teacherProfileId: null,
    } as any);
    expect(status(await load('documentId=doc'))).toBe(404);
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
    expect(prisma.pasteAlert.findMany).not.toHaveBeenCalled();
  });
  test('scopes the document before reading events and excludes the actor’s own work', async () => {
    await load('documentId=doc');
    expect(prisma.document.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'doc',
      deletedAt: null,
      artifactKind: 'STUDENT',
      membership: { is: { userId: { not: 'teacher-user' } } },
      OR: [
        { classAssignment: { class: { school: { organizationId: 'org' }, teachers: { some: { id: 'teacher', isActive: true } } } } },
        { classAssignment: { is: null }, membership: { is: { organizationId: 'org', classesAsStudent: { some: { school: { organizationId: 'org' }, teachers: { some: { id: 'teacher', isActive: true } } } } } } },
      ],
    });
    expect(prisma.pasteAlert.findMany.mock.calls[0][0]).toMatchObject({
      where: { documentId: 'doc' },
      select: { id: true, textLength: true, createdAt: true },
    });
  });
  test('forbidden and missing documents return the same empty 404, without event queries', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
    expect(status(await load('documentId=other-org-doc'))).toBe(404);
    expect(prisma.pasteAlert.findMany).not.toHaveBeenCalled();
  });
  test('submissions use their frozen HTML era, never later draft paste events', async () => {
    await load('submissionId=sub');
    expect(
      prisma.submission.findFirst.mock.calls[0][0].where.document.is
    ).toMatchObject({
      OR: [
        { classAssignment: { class: { school: { organizationId: 'org' }, teachers: { some: { id: 'teacher', isActive: true } } } } },
        { classAssignment: { is: null }, membership: { is: { organizationId: 'org', classesAsStudent: { some: { school: { organizationId: 'org' }, teachers: { some: { id: 'teacher', isActive: true } } } } } } },
      ],
    });
    expect(prisma.pasteAlert.findMany.mock.calls[0][0].where).toEqual({
      documentId: 'doc',
      createdAt: { lte: new Date('2026-01-01') },
    });
  });
  test('a cursor from another document cannot reveal event positions', async () => {
    expect(status(await load('documentId=doc&cursor=foreign-event'))).toBe(404);
    expect(prisma.pasteAlert.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'foreign-event',
      documentId: 'doc',
    });
    expect(prisma.pasteAlert.findMany).not.toHaveBeenCalled();
  });
  test('exactly one subject is required, pages are bounded and ordered stably', async () => {
    expect(status(await load(''))).toBe(400);
    expect(status(await load('documentId=doc&submissionId=sub'))).toBe(400);
    prisma.pasteAlert.findMany.mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({
        id: `id${i}`,
        textLength: 200,
        createdAt: new Date(),
      }))
    );
    const result = payload(await load('documentId=doc'));
    expect(result.events).toHaveLength(100);
    expect(result.nextCursor).toBe('id99');
    expect(prisma.pasteAlert.findMany.mock.calls[0][0].take).toBe(101);
  });
});

test('a delayed event is included only when its identity is present in the frozen snapshot', async () => {
  const linked = 'paste_12345678-1234-4321-8123-123456789abc';
  prisma.submission.findFirst.mockResolvedValue({
    documentId: 'doc',
    submittedAt: new Date('2026-01-01'),
    html: `<p><span data-pasted-source="external" data-paste-event-id="${linked}">text</span></p>`,
  });
  await load('submissionId=sub');
  expect(prisma.pasteAlert.findMany.mock.calls[0][0].where).toEqual({
    documentId: 'doc',
    OR: [
      { createdAt: { lte: new Date('2026-01-01') } },
      { id: { in: [linked] } },
    ],
  });
});

test('literal source-code text naming an event does not add it to a submission', async () => {
  const id = 'paste_12345678-1234-4321-8123-123456789abc';
  prisma.submission.findFirst.mockResolvedValue({
    documentId: 'doc',
    submittedAt: new Date('2026-01-01'),
    html: `<p>&lt;span data-pasted-source="external" data-paste-event-id="${id}"&gt;example&lt;/span&gt;</p>`,
  });
  await load('submissionId=sub');
  expect(prisma.pasteAlert.findMany.mock.calls[0][0].where).toEqual({
    documentId: 'doc',
    createdAt: { lte: new Date('2026-01-01') },
  });
});

test('admin scope still excludes same-user owners and every assignment-group artifact', async () => {
  getGradingActor.mockResolvedValue({
    ...actor,
    membershipId: 'other-membership',
    organizationId: 'other-org',
    isAdmin: true,
  });
  prisma.document.findFirst.mockResolvedValue(null);
  expect(status(await load('documentId=own-solo-or-group'))).toBe(404);
  const where = prisma.document.findFirst.mock.calls[0][0].where;
  expect(where.artifactKind).toBe('STUDENT');
  expect(where.membership.is.userId).toEqual({ not: 'teacher-user' });
  expect(prisma.pasteAlert.findMany).not.toHaveBeenCalled();
});
