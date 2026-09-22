import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
  classAssignment: { findMany: mock() },
  document: { findMany: mock() },
  organizationAssignmentType: { findMany: mock() },
  school: { findMany: mock() },
  orgMembership: { findMany: mock() },
  assignmentType: { findMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/db.server.js', () => ({ prisma }));

const { loadStudentClassDetail } = await import('./student-class-detail.server');

function resetPrisma() {
  for (const model of Object.values(prisma)) {
    for (const fn of Object.values(model)) {
      fn.mockReset();
    }
  }
}

function seedEnrolledClass() {
  prisma.class.findFirst.mockResolvedValue({
    id: 'class-1',
    grade: '9',
    period: '2',
    title: 'World History',
    classArtIndex: 3,
    classArtKey: 'art-key',
    school: { id: 'school-1', name: 'Tallassee High', organizationId: 'org-1' },
    teachers: [{ id: 'teacher-1', user: { name: 'Ms. Frizzle' } }],
  });
  prisma.classAssignment.findMany.mockResolvedValue([]);
  prisma.document.findMany.mockResolvedValue([]);
  // getAvailableAssignmentTypesForScopes runs for real against these.
  prisma.organizationAssignmentType.findMany.mockResolvedValue([
    { organizationId: 'org-1', assignmentTypeId: 'type-1' },
  ]);
  prisma.school.findMany.mockResolvedValue([
    {
      id: 'school-1',
      organizationId: 'org-1',
      assignmentTypesCustomized: false,
      assignmentTypeAssignments: [],
    },
  ]);
  prisma.orgMembership.findMany.mockResolvedValue([
    {
      id: 'teacher-1',
      organizationId: 'org-1',
      assignmentTypesCustomized: false,
      assignmentTypeAssignments: [],
    },
  ]);
  prisma.assignmentType.findMany.mockResolvedValue([
    { id: 'type-1', title: 'Thesis Builder' },
  ]);
}

describe('loadStudentClassDetail', () => {
  beforeEach(() => {
    resetPrisma();
    seedEnrolledClass();
  });

  test('scopes the class lookup to classes the student is enrolled in', async () => {
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    expect(prisma.class.findFirst.mock.calls[0][0].where).toEqual({
      id: 'class-1',
      isArchived: false,
      students: { some: { id: 'student-1' } },
    });
  });

  test('refuses a class the student is not enrolled in', async () => {
    // The enrollment predicate in the query means a class belonging to another
    // section simply does not match.
    prisma.class.findFirst.mockResolvedValue(null);

    const result = await loadStudentClassDetail({
      membershipId: 'student-of-other-class',
      classId: 'class-1',
    });

    expect(result).toBeNull();
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  test('returns the class heading fields plus teacher names', async () => {
    const result = await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    expect(result?.klass).toEqual({
      id: 'class-1',
      grade: '9',
      period: '2',
      title: 'World History',
      classArtKey: 'art-key',
      legacyClassArtIndex: 3,
      school: { id: 'school-1', name: 'Tallassee High' },
      teacherNames: ['Ms. Frizzle'],
    });
  });

  test('lists only this class assignments', async () => {
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    expect(prisma.classAssignment.findMany.mock.calls[0][0].where.classId).toBe(
      'class-1'
    );
  });

  test('hides a collaborative assignment until this student’s group is open', async () => {
    // Before the teacher opens groups there is no document to open, so the
    // assignment stays off the list rather than sitting there refusing the
    // click. Solo assignments match the first branch and are unaffected.
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    const where = prisma.classAssignment.findMany.mock.calls[0][0].where;
    expect(where.AND[0]).toEqual({
      OR: [
        { assignment: { is: { collaborationEnabled: false } } },
        {
          documentGroups: {
            some: {
              openedAt: { not: null },
              members: { some: { membershipId: 'student-1', removedAt: null } },
            },
          },
        },
      ],
    });
  });

  test('hides an assignment until its post date', async () => {
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    const where = prisma.classAssignment.findMany.mock.calls[0][0].where;
    expect(where.AND[1]).toEqual({
      OR: [{ postAt: null }, { postAt: { lte: expect.any(Date) } }],
    });
  });

  test('applies both gates, neither overwriting the other', async () => {
    // Each gate is expressed as an `OR`, so spreading them side by side would
    // leave one silently overwriting the other at that key — showing a student
    // either a group assignment they cannot open, or one before its post date.
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    const where = prisma.classAssignment.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(2);
    expect(where.OR).toBeUndefined();
  });

  test('scopes documents to this student in this class', async () => {
    await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      archivedAt: null,
      OR: [
        {
          classAssignment: { classId: 'class-1' },
          membershipId: 'student-1',
        },
        {
          classAssignment: {
            classId: 'class-1',
            OR: [
              { postAt: null },
              { postAt: { lte: expect.any(Date) } },
            ],
          },
          group: {
            is: {
              members: {
                some: { membershipId: 'student-1', removedAt: null },
              },
            },
          },
        },
        { classAssignmentId: null, membershipId: 'student-1' },
      ],
    });
  });

  test('inherits assignment types from the class teachers rather than a hardcoded list', async () => {
    const result = await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    expect(result?.assignmentTypes).toEqual([
      { id: 'type-1', title: 'Thesis Builder' },
    ]);
    expect(prisma.orgMembership.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['teacher-1'] },
    });
  });

  test('drops assignment types the class teacher has turned off', async () => {
    prisma.orgMembership.findMany.mockResolvedValue([
      {
        id: 'teacher-1',
        organizationId: 'org-1',
        assignmentTypesCustomized: true,
        assignmentTypeAssignments: [],
      },
    ]);

    const result = await loadStudentClassDetail({
      membershipId: 'student-1',
      classId: 'class-1',
    });

    expect(result?.assignmentTypes).toEqual([]);
  });
});
