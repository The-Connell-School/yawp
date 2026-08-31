import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  document: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();
const resolveStudentSchoolYearScope = mock(() => Promise.resolve('2025-2026'));

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/auth.server.js', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/school-year-scope.server', () => ({
  resolveStudentSchoolYearScope,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

const historyClass = {
  id: 'class-history',
  grade: '9',
  period: '1',
  title: 'History',
};

function load(url: string) {
  return loader({
    request: new Request(url),
    params: {},
    context: {} as never,
  } as any);
}

describe('my documents route', () => {
  beforeEach(() => {
    prisma.document.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    resolveStudentSchoolYearScope.mockClear();
    resolveStudentSchoolYearScope.mockResolvedValue('2025-2026');
  });

  /**
   * The student's work has to be scoped by the same year their classes are, or
   * My Documents and My Classes disagree about what year it is. Work the
   * student started outside a class has no year, so it is never scoped away.
   */
  test('scopes class work to the selected year and keeps unassigned work', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.document.findMany.mockResolvedValue([]);

    await load('https://example.test/app/my-documents');

    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: [
                { classAssignment: { class: { schoolYear: '2025-2026' } } },
                { classAssignment: { is: null } },
              ],
            },
          ]),
        }),
      })
    );
  });

  test('a student viewing all years is not scoped at all', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    resolveStudentSchoolYearScope.mockResolvedValue('all');
    prisma.document.findMany.mockResolvedValue([]);

    await load('https://example.test/app/my-documents');

    const [{ where }] = prisma.document.findMany.mock.calls[0];
    expect(where.AND).toEqual([
      {
        OR: [
          { membershipId: 'profile-1' },
          {
            AND: [
              {
                group: {
                  is: {
                    members: {
                      some: { membershipId: 'profile-1', removedAt: null },
                    },
                  },
                },
              },
              {
                classAssignment: {
                  is: {
                    OR: [
                      { postAt: null },
                      { postAt: { lte: expect.any(Date) } },
                    ],
                  },
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  test('redirects a teacher to the teacher documents/grading surface', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });

    await expect(
      load('https://example.test/app/my-documents')
    ).rejects.toMatchObject({
      status: 302,
    });
  });

  test('groups a student’s documents by class, unassigned documents last', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-practice',
        title: 'Free write',
        updatedAt: new Date(),
        classAssignment: null,
        assignment: null,
        assignmentModuleSessions: [],
        submissions: [],
      },
      {
        id: 'doc-history',
        title: 'DBQ Draft',
        updatedAt: new Date(),
        classAssignment: { class: historyClass },
        assignment: { id: 'a-dbq', title: 'DBQ' },
        assignmentModuleSessions: [],
        submissions: [],
      },
    ]);

    const response = await load('https://example.test/app/my-documents');

    expect(prisma.document.findMany.mock.calls[0][0].where).toMatchObject({
      deletedAt: null,
      archivedAt: null,
    });
    expect(response.data.documentCount).toBe(2);
    expect(response.data.documents.map((d: any) => d.id)).toEqual([
      'doc-practice',
      'doc-history',
    ]);
  });

  test('offers the student’s own classes and assignments as filter options', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.document.findMany.mockResolvedValue([
      {
        id: 'doc-practice',
        title: 'Free write',
        updatedAt: new Date(),
        classAssignment: null,
        assignment: null,
        assignmentModuleSessions: [],
        submissions: [],
      },
      {
        id: 'doc-history',
        title: 'DBQ Draft',
        updatedAt: new Date(),
        classAssignment: { class: historyClass },
        assignment: { id: 'a-dbq', title: 'DBQ' },
        assignmentModuleSessions: [],
        submissions: [],
      },
    ]);

    const response = await load('https://example.test/app/my-documents');

    expect(response.data.classes).toEqual([
      { id: 'class-history', label: 'History · Grade 9 • Period 1' },
      { id: '__unassigned__', label: 'Not tied to a class' },
    ]);
    expect(response.data.assignments).toEqual([
      { id: 'a-dbq', label: 'DBQ', classIds: ['class-history'] },
    ]);
  });

  test('reads the filters off the URL so a filtered view is linkable', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.document.findMany.mockResolvedValue([]);

    const response = await load(
      'https://example.test/app/my-documents?class=class-history&assignment=a-dbq&status=graded'
    );

    expect(response.data.filters).toEqual({
      classIds: ['class-history'],
      assignmentIds: ['a-dbq'],
      status: 'graded',
    });
  });

  test('reads submission fields the student status depends on', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });
    prisma.document.findMany.mockResolvedValue([]);

    await load('https://example.test/app/my-documents');

    const submissionSelect =
      prisma.document.findMany.mock.calls[0][0].include.submissions.select;

    expect(submissionSelect).toMatchObject({
      releasedAt: true,
      submittedAt: true,
      archivedAt: true,
      unsubmittedAt: true,
    });
  });
});
