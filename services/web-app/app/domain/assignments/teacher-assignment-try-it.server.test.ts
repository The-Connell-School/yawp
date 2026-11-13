import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { classAssignment: { findFirst: mock() } };

mock.module('~/utils/db.server', () => ({ prisma }));

const { buildAssignmentTryItHref } = await import(
  './teacher-assignment-try-it-href'
);
const { resolveTeacherTryItClassAssignment } = await import(
  './teacher-assignment-try-it.server'
);

afterAll(() => mock.restore());

describe('buildAssignmentTryItHref', () => {
  test('builds try-it path with optional class and return targets', () => {
    expect(buildAssignmentTryItHref({ id: 'a-1' })).toBe(
      '/app/assignments/a-1/try-it'
    );
    expect(
      buildAssignmentTryItHref(
        { id: 'a-1', classId: 'class-9' },
        { returnTo: '/app/assignments/a-1?classId=class-9' }
      )
    ).toBe(
      '/app/assignments/a-1/try-it?classId=class-9&returnTo=%2Fapp%2Fassignments%2Fa-1%3FclassId%3Dclass-9'
    );
  });
});

describe('resolveTeacherTryItClassAssignment', () => {
  beforeEach(() => {
    prisma.classAssignment.findFirst.mockReset();
  });

  test('scopes to classes the teacher owns', async () => {
    prisma.classAssignment.findFirst.mockResolvedValue({ id: 'ca-1' });

    await resolveTeacherTryItClassAssignment({
      assignmentId: 'a-1',
      teacherMembershipId: 'teacher-1',
      classId: 'class-9',
    });

    expect(prisma.classAssignment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignmentId: 'a-1',
          class: expect.objectContaining({
            id: 'class-9',
            teachers: { some: { id: 'teacher-1' } },
          }),
        }),
      })
    );
  });
});
