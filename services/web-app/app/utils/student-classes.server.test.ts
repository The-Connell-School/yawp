import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
};

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { getStudentEnrolledClasses } = await import('./student-classes.server');

afterAll(() => {
  mock.restore();
});

describe('getStudentEnrolledClasses', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
  });

  test('queries only non-archived classes the membership is enrolled in as a student', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await getStudentEnrolledClasses('membership-1');

    expect(prisma.class.findMany.mock.calls[0][0].where).toEqual({
      students: { some: { id: 'membership-1' } },
      isArchived: false,
    });
  });

  test('flattens teacher names and drops missing ones', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        grade: '9',
        period: '2',
        title: 'English',
        classArtIndex: null,
        classArtKey: 'indigo',
        school: { id: 'school-1', name: 'E2E High' },
        teachers: [
          { user: { name: 'Mrs Test Teacher' } },
          { user: { name: null } },
        ],
      },
    ]);

    const classes = await getStudentEnrolledClasses('membership-1');

    expect(classes).toEqual([
      {
        id: 'class-1',
        grade: '9',
        period: '2',
        title: 'English',
        classArtKey: 'indigo',
        legacyClassArtIndex: null,
        school: { id: 'school-1', name: 'E2E High' },
        teacherNames: ['Mrs Test Teacher'],
      },
    ]);
  });
});
