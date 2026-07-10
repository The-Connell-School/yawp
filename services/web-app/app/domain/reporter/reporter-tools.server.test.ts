import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock(), findFirst: mock() },
  submission: { findMany: mock(), findFirst: mock() },
  orgMembership: { findFirst: mock(), findMany: mock() },
  reporterGrowthPlan: { findMany: mock(), create: mock(), updateMany: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { handleReporterToolCall, REPORTER_TOOLS } =
  await import('./reporter-tools.server');

const ctx = { membershipId: 'teacher-1', organizationId: 'org-1' };

beforeEach(() => {
  prisma.class.findMany.mockReset();
  prisma.class.findFirst.mockReset();
  prisma.submission.findMany.mockReset();
  prisma.submission.findFirst.mockReset();
  prisma.orgMembership.findFirst.mockReset();
  prisma.orgMembership.findMany.mockReset();
  prisma.reporterGrowthPlan.findMany.mockReset();
  prisma.reporterGrowthPlan.create.mockReset();
  prisma.reporterGrowthPlan.updateMany.mockReset();
});

describe('REPORTER_TOOLS', () => {
  test('exposes the expected tool names', () => {
    expect(REPORTER_TOOLS.map((tool) => tool.name)).toEqual([
      'list_classes',
      'get_class_grade_report',
      'get_student_grade_report',
      'get_student_growth',
      'find_students_needing_attention',
      'get_submission_detail',
      'list_growth_plans',
      'save_growth_plan',
    ]);
  });
});

describe('handleReporterToolCall dispatch', () => {
  test('unknown tool returns a structured error', async () => {
    const result = JSON.parse(await handleReporterToolCall('nope', {}, ctx));
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

    const result = JSON.parse(
      await handleReporterToolCall('list_classes', {}, ctx)
    );

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
    expect(subWhere.document.classAssignment.class.teachers.some.id).toBe(
      'teacher-1'
    );

    expect(result.gradedSubmissionCount).toBe(3);
    const ada = result.students.find((s: any) => s.studentName === 'Ada');
    expect(ada.averagePercentage).toBe(80);
    // class average of Ada (80) and Grace (100) = 90
    expect(result.classAveragePercentage).toBe(90);
  });
});

describe('get_student_growth', () => {
  test('refuses a student not in any class the teacher teaches', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    const result = JSON.parse(
      await handleReporterToolCall(
        'get_student_growth',
        { student: 'Nobody Here' },
        ctx
      )
    );
    expect(result.error).toContain('No student named');
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });

  test('resolves a student by name, scoped to the teacher, then builds the series', async () => {
    // Not an id match...
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    // ...but a unique name match within the teacher's classes.
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: 'stu-1', user: { name: 'Ada Lovelace' } },
    ]);
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({
        id: 's2',
        name: 'Ada Lovelace',
        pct: 95,
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        rubricScores: { evidence_and_support: 2, grammar_and_mechanics: 5 },
      }),
      submissionRow({
        id: 's1',
        name: 'Ada Lovelace',
        pct: 60,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        rubricScores: { evidence_and_support: 4, grammar_and_mechanics: 3 },
      }),
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_student_growth',
        { student: 'Ada Lovelace' },
        ctx
      )
    );

    // Name lookup is case-insensitive and scoped to the teacher's classes.
    const nameWhere = prisma.orgMembership.findMany.mock.calls[0][0].where;
    expect(nameWhere.user.name).toEqual({
      equals: 'Ada Lovelace',
      mode: 'insensitive',
    });
    expect(nameWhere.classesAsStudent.some.teachers.some.id).toBe('teacher-1');

    expect(result.student.studentName).toBe('Ada Lovelace');
    expect(result.student.studentMembershipId).toBe('stu-1');
    expect(result.points.map((p: any) => p.submissionId)).toEqual(['s1', 's2']);
    expect(result.deltaPercentage).toBe(35);
    expect(result.trend).toBe('improving');

    // Rubric-level writing signal comes back with the growth series (chronological).
    const evidence = result.rubricTrends.find(
      (t: any) => t.category === 'evidence_and_support'
    );
    expect(evidence).toMatchObject({
      first: 4,
      latest: 2,
      direction: 'declining',
    });
    // Per-point rubric scores are attached for the assignment-by-assignment view.
    expect(result.points[0].rubricScores.grammar_and_mechanics).toBe(3);
  });

  test('returns candidates when a name is ambiguous', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: 'stu-1', user: { name: 'Alex Kim' } },
      { id: 'stu-2', user: { name: 'Alex Kim' } },
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_student_growth',
        { student: 'Alex Kim' },
        ctx
      )
    );

    expect(result.error).toContain('More than one student');
    expect(result.ambiguous).toHaveLength(2);
    expect(prisma.submission.findMany).not.toHaveBeenCalled();
  });
});

describe('get_class_grade_report rubric summary', () => {
  test('includes per-skill class averages alongside student averages', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      title: 'Honors English',
      grade: '10',
      period: '2',
    });
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({
        id: 's1',
        name: 'Ada',
        pct: 80,
        rubricScores: { evidence_and_support: 2, thesis_and_content: 4 },
      }),
      submissionRow({
        id: 's2',
        membershipId: 'stu-2',
        name: 'Grace',
        pct: 90,
        rubricScores: { evidence_and_support: 4, thesis_and_content: 5 },
      }),
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_class_grade_report',
        { classId: 'class-1' },
        ctx
      )
    );

    const evidence = result.rubricSummary.find(
      (r: any) => r.category === 'evidence_and_support'
    );
    expect(evidence.averageLevel).toBe(3);
    expect(evidence.scoredCount).toBe(2);
  });
});

describe('find_students_needing_attention', () => {
  test('scans the teacher scope and returns flagged students', async () => {
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({
        id: 'a1',
        membershipId: 'stu-low',
        name: 'Amelia Brooks',
        pct: 60,
        submittedAt: new Date('2026-01-01T00:00:00.000Z'),
        rubricScores: { evidence_and_support: 4 },
      }),
      submissionRow({
        id: 'a2',
        membershipId: 'stu-low',
        name: 'Amelia Brooks',
        pct: 50,
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        rubricScores: { evidence_and_support: 2 },
      }),
      submissionRow({
        id: 'b1',
        membershipId: 'stu-ok',
        name: 'Grace Hopper',
        pct: 95,
        submittedAt: new Date('2026-03-01T00:00:00.000Z'),
        rubricScores: { evidence_and_support: 5 },
      }),
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'find_students_needing_attention',
        {},
        ctx
      )
    );

    // No classId → scans all the teacher's classes (no class filter applied).
    const where = prisma.submission.findMany.mock.calls[0][0].where;
    expect(where.document.classAssignment.class.id).toBeUndefined();
    expect(where.document.classAssignment.class.teachers.some.id).toBe(
      'teacher-1'
    );

    expect(result.scope).toBe('all_classes');
    expect(result.studentsConsidered).toBe(2);
    expect(result.flaggedCount).toBe(1);
    expect(result.students[0].studentName).toBe('Amelia Brooks');
    expect(result.averageThreshold).toBe(70);
  });

  test('passes a class filter and custom threshold through', async () => {
    prisma.submission.findMany.mockResolvedValue([]);
    const result = JSON.parse(
      await handleReporterToolCall(
        'find_students_needing_attention',
        { classId: 'class-9', averageThreshold: 85 },
        ctx
      )
    );
    const where = prisma.submission.findMany.mock.calls[0][0].where;
    expect(where.document.classAssignment.class.id).toBe('class-9');
    expect(result.scope).toBe('class');
    expect(result.averageThreshold).toBe(85);
    expect(result.flaggedCount).toBe(0);
  });
});

describe('get_submission_detail', () => {
  test('returns an error when the submission is not in the teacher scope', async () => {
    prisma.submission.findFirst.mockResolvedValue(null);
    const result = JSON.parse(
      await handleReporterToolCall(
        'get_submission_detail',
        { submissionId: 'sub-x' },
        ctx
      )
    );
    expect(result.error).toContain('not found');
    // Scope is enforced in the query: teacher + org + released + not archived.
    const where = prisma.submission.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('sub-x');
    expect(where.releasedAt).toEqual({ not: null });
    expect(where.archivedAt).toBeNull();
    expect(
      where.document.classAssignment.class.teachers.some.id
    ).toBe('teacher-1');
    expect(
      where.document.classAssignment.class.school.organizationId
    ).toBe('org-1');
  });

  test('surfaces essay text, inline comments, feedback, and grammar issues', async () => {
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-1',
      text: 'The ibis was red. It sat in the tree. Doodle looked up at it.',
      submittedAt: new Date('2026-02-01T00:00:00.000Z'),
      numericPercentage: 84,
      letterGrade: 'B',
      overallScore: 4,
      rubricScores: { evidence_and_support: 2, grammar_and_mechanics: 5 },
      overallComment: 'Strong control, thin analysis.',
      feedback: 'Push past summary into interpretation.',
      grammarIssues: [
        { excerpt: 'It sat in the tree.', message: 'Vague pronoun.', kind: 'style' },
      ],
      document: {
        membership: { user: { name: 'Amelia Brooks' } },
        classAssignment: { assignment: { title: 'Scarlet Ibis Analysis' } },
      },
      comments: [
        { excerpt: 'The ibis was red.', content: 'What does the color signal here?' },
        { excerpt: 'Doodle looked up at it.', content: 'Good — connect this to the ending.' },
      ],
    });

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_submission_detail',
        { submissionId: 'sub-1' },
        ctx
      )
    );

    expect(result.student.studentName).toBe('Amelia Brooks');
    expect(result.assignmentTitle).toBe('Scarlet Ibis Analysis');
    expect(result.numericPercentage).toBe(84);
    expect(result.rubricScores.evidence_and_support).toBe(2);
    expect(result.overallComment).toBe('Strong control, thin analysis.');
    expect(result.feedback).toBe('Push past summary into interpretation.');
    expect(result.inlineComments).toHaveLength(2);
    expect(result.inlineComments[0]).toEqual({
      excerpt: 'The ibis was red.',
      comment: 'What does the color signal here?',
    });
    expect(result.inlineCommentCount).toBe(2);
    expect(result.grammarIssues[0]).toMatchObject({
      excerpt: 'It sat in the tree.',
      kind: 'style',
    });
    expect(result.essayExcerpt.excerpt).toContain('The ibis was red.');
    expect(result.essayExcerpt.truncated).toBe(false);
  });

  test('truncates a long essay body to a bounded excerpt', async () => {
    const longText = 'A'.repeat(3000);
    prisma.submission.findFirst.mockResolvedValue({
      id: 'sub-2',
      text: longText,
      submittedAt: new Date('2026-02-01T00:00:00.000Z'),
      numericPercentage: 70,
      letterGrade: 'C-',
      overallScore: 3,
      rubricScores: null,
      overallComment: null,
      feedback: null,
      grammarIssues: null,
      document: {
        membership: { user: { name: 'Liam Torres' } },
        classAssignment: { assignment: { title: 'Essay' } },
      },
      comments: [],
    });

    const result = JSON.parse(
      await handleReporterToolCall(
        'get_submission_detail',
        { submissionId: 'sub-2' },
        ctx
      )
    );

    expect(result.essayExcerpt.truncated).toBe(true);
    expect(result.essayExcerpt.totalChars).toBe(3000);
    expect(result.essayExcerpt.excerpt.length).toBeLessThan(3000);
    expect(result.essayExcerpt.excerpt.endsWith('…')).toBe(true);
    expect(result.grammarIssues).toEqual([]);
    expect(result.inlineComments).toEqual([]);
  });
});

describe('save_growth_plan', () => {
  test('snapshots a baseline, archives prior active plans, and creates the plan', async () => {
    // Resolve student by name.
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: 'stu-1', user: { name: 'Amelia Brooks' } },
    ]);
    // Baseline is captured from the student's current submissions.
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({
        id: 's1',
        name: 'Amelia Brooks',
        pct: 60,
        rubricScores: { evidence_and_support: 2 },
      }),
    ]);
    prisma.reporterGrowthPlan.updateMany.mockResolvedValue({ count: 1 });
    prisma.reporterGrowthPlan.create.mockResolvedValue({ id: 'plan-1' });

    const result = JSON.parse(
      await handleReporterToolCall(
        'save_growth_plan',
        {
          student: 'Amelia Brooks',
          focus: 'Turn description into analysis',
          targetSkills: ['evidence_and_support'],
          body: '## Focus\nPush past summary.',
          checkInInDays: 14,
        },
        ctx
      )
    );

    // Prior active plan for this student is archived first.
    const archiveWhere = prisma.reporterGrowthPlan.updateMany.mock.calls[0][0];
    expect(archiveWhere.where).toMatchObject({
      membershipId: 'teacher-1',
      studentMembershipId: 'stu-1',
      status: 'active',
    });
    expect(archiveWhere.data).toEqual({ status: 'archived' });

    // The created plan carries the baseline snapshot and scope.
    const createData = prisma.reporterGrowthPlan.create.mock.calls[0][0].data;
    expect(createData.status).toBe('active');
    expect(createData.membershipId).toBe('teacher-1');
    expect(createData.studentMembershipId).toBe('stu-1');
    expect(createData.targetSkills).toEqual(['evidence_and_support']);
    expect(createData.baseline.rubricLevels).toEqual({ evidence_and_support: 2 });
    expect(createData.baseline.averagePercentage).toBe(60);
    expect(createData.checkInAt).toBeInstanceOf(Date);

    expect(result.saved).toBe(true);
    expect(result.planId).toBe('plan-1');
    expect(result.student.studentName).toBe('Amelia Brooks');
  });

  test('refuses to save for a student outside the teacher scope', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.findMany.mockResolvedValue([]);
    const result = JSON.parse(
      await handleReporterToolCall(
        'save_growth_plan',
        {
          student: 'Nobody',
          focus: 'x',
          targetSkills: ['evidence_and_support'],
          body: 'x',
        },
        ctx
      )
    );
    expect(result.error).toContain('No student named');
    expect(prisma.reporterGrowthPlan.create).not.toHaveBeenCalled();
  });
});

describe('list_growth_plans', () => {
  test('returns a student plan with progress measured against its baseline', async () => {
    prisma.orgMembership.findFirst.mockResolvedValue(null);
    prisma.orgMembership.findMany.mockResolvedValue([
      { id: 'stu-1', user: { name: 'Amelia Brooks' } },
    ]);
    prisma.reporterGrowthPlan.findMany.mockResolvedValue([
      {
        id: 'plan-1',
        status: 'active',
        focus: 'Turn description into analysis',
        targetSkills: ['evidence_and_support'],
        body: '## Focus\nPush past summary.',
        baseline: {
          averagePercentage: 60,
          rubricLevels: { evidence_and_support: 2 },
          capturedAt: '2026-03-01T00:00:00.000Z',
        },
        checkInAt: null,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        studentMembershipId: 'stu-1',
        student: { user: { name: 'Amelia Brooks' } },
      },
    ]);
    // Current work: evidence up to 3, average up to 78.
    prisma.submission.findMany.mockResolvedValue([
      submissionRow({
        id: 's2',
        name: 'Amelia Brooks',
        pct: 78,
        rubricScores: { evidence_and_support: 3 },
      }),
    ]);

    const result = JSON.parse(
      await handleReporterToolCall(
        'list_growth_plans',
        { student: 'Amelia Brooks' },
        ctx
      )
    );

    // Only active plans unless includeArchived is set.
    const where = prisma.reporterGrowthPlan.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['active'] });
    expect(where.membershipId).toBe('teacher-1');
    expect(where.studentMembershipId).toBe('stu-1');

    expect(result.planCount).toBe(1);
    const plan = result.plans[0];
    expect(plan.focus).toBe('Turn description into analysis');
    expect(plan.body).toContain('Push past summary'); // body included for a single student
    expect(plan.progress.averagePercentage).toEqual({
      baseline: 60,
      current: 78,
      delta: 18,
    });
    expect(plan.progress.skills[0]).toMatchObject({
      category: 'evidence_and_support',
      baselineLevel: 2,
      currentLevel: 3,
      delta: 1,
    });
  });

  test('includes archived plans when asked and omits body for the cross-student list', async () => {
    prisma.reporterGrowthPlan.findMany.mockResolvedValue([]);
    const result = JSON.parse(
      await handleReporterToolCall(
        'list_growth_plans',
        { includeArchived: true },
        ctx
      )
    );
    const where = prisma.reporterGrowthPlan.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ['active', 'archived', 'completed'] });
    expect(where.studentMembershipId).toBeUndefined();
    expect(result.planCount).toBe(0);
  });
});

function submissionRow({
  id,
  membershipId = 'stu-1',
  name,
  pct,
  submittedAt = new Date('2026-01-01T00:00:00.000Z'),
  rubricScores = null,
}: {
  id: string;
  membershipId?: string;
  name: string;
  pct: number | null;
  submittedAt?: Date;
  rubricScores?: Record<string, number> | null;
}) {
  return {
    id,
    submittedAt,
    numericPercentage: pct,
    letterGrade: null,
    rubricScores,
    overallComment: null,
    document: {
      membershipId,
      membership: { user: { name } },
      classAssignment: { assignment: { title: 'Essay' } },
    },
  };
}
