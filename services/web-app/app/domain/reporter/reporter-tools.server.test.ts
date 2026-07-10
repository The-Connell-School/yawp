import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock(), findFirst: mock() },
  submission: { findMany: mock() },
  orgMembership: { findFirst: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { handleReporterToolCall, REPORTER_TOOLS } = await import(
  './reporter-tools.server'
);

const ctx = { membershipId: 'teacher-1', organizationId: 'org-1' };

beforeEach(() => {
  prisma.class.findMany.mockReset();
  prisma.class.findFirst.mockReset();
  prisma.submission.findMany.mockReset();
  prisma.orgMembership.findFirst.mockReset();
});

describe('REPORTER_TOOLS', () => {
  test('exposes the expected tool names', () => {
    expect(REPORTER_TOOLS.map((tool) => tool.name)).toEqual([
      'list_classes',
      'get_class_grade_report',
      'get_student_grade_report',
      'get_student_growth',
    ]);
  });
});

describe('handleReporterToolCall dispatch', () => {
  test('unknown tool returns a structured error', async () => {
    const result = JSON.parse(
      await handleReporterToolCall('nope', {}, ctx)
    );
    expect(result.error).toContain('Unknown tool');
  });

  test('invalid input returns a validation error', async () => {
    const result = JSON.parse(
      await handleReporterToolCall('get_class_grade_report', {}, ctx)
    );
    expect(result.error).toBe('Invalid tool input.');
  });
});

describe('list_classes', () => {
  test('scopes to the teacher and org and shapes counts', async () => {
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        title: 'Honors English',
        grade: '10',
        period: '2',
        schoolYear: '2025-2026',
        _count: { students: 24, classAssignments: 5 },
      },
    ]);

    const result = JSON.parse(await handleReporterToolCall('list_classes', {}, ctx));

    const where = prisma.class.findMany.mock.calls[0][0].where;
    expect(where.teachers.some.id).toBe('teacher-1');
    expect(where.school.organizationId).toBe('org-1');
    expect(where.isArchived).toBe(false);
    expect(result.classes[0]).toMatchObject({
      classId: 'class-1',
      title: 'Honors English',
      studentCount: 24,
      assignmentCount: 5,
    });
  });
});

describe('get_class_grade_report', () => {
  test('rejects a class the teacher does not teach', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    const result = JSON.parse(
      await handleReporterToolCall(
        'get_class_grade_report',
        { classId: 'class-x' },
        ctx
      )
    );
    expect(result.error).toContain('not taught by you');
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });

  test('aggregates released submissions into per-student averages', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      title: 'Honors English',
      grade: '10',
      period: '2',
    });
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({ id: 's1', name: 'Ada', pct: 70 }),
      submissionRow({ id: 's2', name: 'Ada', pct: 90 }),
      submissionRow({
        id: 's3',
        membershipId: 'stu-2',
        name: 'Grace',
        pct: 100,
      }),
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_class_grade_report',
        { classId: 'class-1' },
        ctx
      )
    );

    // Released-only filter is enforced in the query.
    const subWhere = prisma.submission.findMany.mock.calls[0][0].where;
    expect(subWhere.releasedAt).toEqual({ not: null });
    expect(
      subWhere.document.classAssignment.class.teachers.some.id
    ).toBe('teacher-1');

    expect(result.gradedSubmissionCount).toBe(3);
    const ada = result.students.find((s: any) => s.studentName === 'Ada');
    expect(ada.averagePercentage).toBe(80);
    // class average of Ada (80) and Grace (100) = 90
    expect(result.classAveragePercentage).toBe(90);
  });
});

describe('get_student_growth', () => {
  test('refuses a student the teacher cannot see', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    const result = JSON.parse(
      await handleReporterToolCall(
        'get_student_growth',
        { studentMembershipId: 'stu-9' },
        ctx
      )
    );
    expect(result.error).toContain('not found');
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });

  test('returns a chronological growth series with trend', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue({
      id: 'stu-1',
      user: { name: 'Ada' },
    });
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({
        id: 's2',
        name: 'Ada',
        pct: 95,
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
      }),
      submissionRow({
        id: 's1',
        name: 'Ada',
        pct: 60,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_student_growth',
        { studentMembershipId: 'stu-1' },
        ctx
      )
    );

    expect(result.student.studentName).toBe('Ada');
    expect(result.points.map((p: any) => p.submissionId)).toEqual(['s1', 's2']);
    expect(result.deltaPercentage).toBe(35);
    expect(result.trend).toBe('improving');
  });
});

function submissionRow({
  id,
  membershipId = 'stu-1',
  name,
  pct,
  submittedAt = new Date('2026-01-01T00:00:00.000Z'),
}: {
  id: string;
  membershipId?: string;
  name: string;
  pct: number | null;
  submittedAt?: Date;
}) {
  return {
    id,
    submittedAt,
    numericPercentage: pct,
    letterGrade: null,
    document: {
      membershipId,
      membership: { user: { name } },
      classAssignment: { assignment: { title: 'Essay' } },
    },
  };
}
