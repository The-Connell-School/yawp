import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { class: { findMany: mock() } };

mock.module('~/utils/db.server', () => ({ prisma }));

const { studentAssignmentTypeScopes } = await import(
  './student-assignment-type-scopes.server'
);

afterAll(() => {
  mock.restore();
});

const call = (schoolYearScope = '2026-2027') =>
  studentAssignmentTypeScopes({ membershipId: 'student-1', schoolYearScope });

describe('studentAssignmentTypeScopes', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset().mockResolvedValue([]);
  });

  test('scopes to the classes the student is enrolled in', async () => {
    await call();

    const where = prisma.class.findMany.mock.calls[0][0].where;
    expect(where.students).toEqual({ some: { id: 'student-1' } });
  });

  test('honours the selected school year', async () => {
    await call('2025-2026');

    expect(prisma.class.findMany.mock.calls[0][0].where.schoolYear).toBe(
      '2025-2026'
    );
  });

  test('does not filter by year when every year is selected', async () => {
    await call('all');

    expect(
      'schoolYear' in prisma.class.findMany.mock.calls[0][0].where
    ).toBe(false);
  });

  test('produces one scope per teacher of each class', async () => {
    // A student writes under each of their teachers, so a co-taught class
    // contributes two scopes rather than one.
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-1' }, { id: 'teacher-2' }],
      },
      {
        id: 'class-2',
        school: { id: 'school-2', organizationId: 'org-1' },
        teachers: [{ id: 'teacher-3' }],
      },
    ]);

    await expect(call()).resolves.toEqual([
      {
        organizationId: 'org-1',
        schoolId: 'school-1',
        teacherProfileId: 'teacher-1',
      },
      {
        organizationId: 'org-1',
        schoolId: 'school-1',
        teacherProfileId: 'teacher-2',
      },
      {
        organizationId: 'org-1',
        schoolId: 'school-2',
        teacherProfileId: 'teacher-3',
      },
    ]);
  });

  test('a class with no teacher contributes no scope', async () => {
    // Fails closed: no teacher means nothing is assignable through that class.
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        school: { id: 'school-1', organizationId: 'org-1' },
        teachers: [],
      },
    ]);

    await expect(call()).resolves.toEqual([]);
  });

  test('a student in no classes gets no scopes', async () => {
    await expect(call()).resolves.toEqual([]);
  });
});
