import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findMany: mock() },
  document: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

const SUMMARY = {
  overview: 'The class held the thesis but thinned out on evidence.',
  categories: [
    {
      key: 'thesis',
      label: 'Thesis',
      status: 'strength',
      summary: 'Clear, arguable claims.',
    },
  ],
  nextSteps: [],
};

function call(url: string, params: Record<string, string>) {
  return loader({
    request: new Request(url),
    params,
    context: {} as never,
  } as any);
}

describe('class summary loader — sections for one assignment', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireMembership.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: {
        id: 'org-1',
        name: 'Org',
        classInsightsEnabled: true,
      },
    });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        classId: 'class-1',
        class: { id: 'class-1', grade: '9', period: '1', title: null },
        insight: {
          status: 'ready',
          submissionCount: 20,
          generatedAt: new Date('2026-08-01T00:00:00.000Z'),
          summaryJson: SUMMARY,
        },
      },
      {
        id: 'ca-2',
        classId: 'class-2',
        class: { id: 'class-2', grade: '9', period: '3', title: null },
        insight: null,
      },
    ]);
    prisma.document.findMany.mockResolvedValue([
      { classAssignmentId: 'ca-1' },
      { classAssignmentId: 'ca-1' },
      { classAssignmentId: 'ca-2' },
    ]);
  });

  test('returns every section of the assignment the teacher teaches', async () => {
    const data: any = await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    expect(data.sections).toHaveLength(2);
    expect(data.sections.map((s: any) => s.classId)).toEqual([
      'class-1',
      'class-2',
    ]);
    expect(data.sections[0].label).toBe('Grade 9 · Period 1');
    expect(data.sections[0].insight.submissionCount).toBe(20);
    expect(data.sections[0].insight.generatedAt).toBe(
      '2026-08-01T00:00:00.000Z'
    );
    expect(data.sections[1].insight).toBeNull();
  });

  test('scopes the query to this assignment and the teacher own active classes', async () => {
    await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    const where = prisma.classAssignment.findMany.mock.calls[0][0].where;
    expect(where.assignmentId).toBe('assignment-1');
    expect(where.class.isArchived).toBe(false);
    expect(where.class.teachers.some.id).toBe('teacher-1');
  });

  test('counts graded work per section so an unsummarized section is not a mystery', async () => {
    const data: any = await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    expect(data.sections[0].gradedCount).toBe(2);
    expect(data.sections[1].gradedCount).toBe(1);
  });

  test('drops an insight that is not ready rather than reporting an empty section', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        classId: 'class-1',
        class: { id: 'class-1', grade: '9', period: '1', title: null },
        insight: {
          status: 'failed',
          submissionCount: 0,
          generatedAt: null,
          summaryJson: null,
        },
      },
    ]);

    const data: any = await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    expect(data.sections[0].insight).toBeNull();
  });

  test('skips the section queries entirely when class insights are off', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: {
        id: 'org-1',
        name: 'Org',
        classInsightsEnabled: false,
      },
    });

    const data: any = await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    expect(data.sections).toEqual([]);
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
  });

  test('falls back to the class title when a class has no grade or period', async () => {
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        classId: 'class-1',
        class: {
          id: 'class-1',
          grade: null,
          period: null,
          title: 'Honors English',
        },
        insight: null,
      },
      {
        id: 'ca-9',
        classId: 'class-9',
        class: { id: 'class-9', grade: null, period: null, title: null },
        insight: null,
      },
    ]);

    const data: any = await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    expect(data.sections[0].label).toBe('Honors English');
    expect(data.sections[1].label).toBe('Untitled class');
  });

  test('sends a non-teacher away', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', name: 'Org', classInsightsEnabled: true },
    });

    const response: any = await call(
      'https://example.test/app/my-classes/class-1/summary/assignment-1',
      { classId: 'class-1', assignmentId: 'assignment-1' }
    );

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });
});
