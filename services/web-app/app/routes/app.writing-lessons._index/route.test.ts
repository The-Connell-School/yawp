import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const listWritingPracticeAssignmentsForStudent = mock();
const listWritingPracticeAssignmentsForTeacher = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    class: { findMany: classFindMany, findFirst: mock() },
  },
}));

mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  listWritingPracticeAssignmentsForStudent,
  listWritingPracticeAssignmentsForTeacher,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
  delete process.env.COMPOSITION_PRACTICE_ENABLED;
});

describe('writing lessons index route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    classFindMany.mockReset();
    listWritingPracticeAssignmentsForStudent.mockReset();
    listWritingPracticeAssignmentsForTeacher.mockReset();
    listWritingPracticeAssignmentsForStudent.mockResolvedValue([]);
    listWritingPracticeAssignmentsForTeacher.mockResolvedValue([]);

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    classFindMany.mockResolvedValue([]);
    delete process.env.COMPOSITION_PRACTICE_ENABLED;
  });

  test('loads by direct URL when the org has writing practice enabled', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    // Grammar & Mechanics is always present; Composition appears when enabled.
    expect(
      response.data.sections.some(
        (section) => section.section === 'Grammar & Mechanics'
      )
    ).toBe(true);
    expect(
      response.data.sections.some((section) =>
        section.groups.some((group) => group.lessons.length > 0)
      )
    ).toBe(true);
  });

  test('redirects to the dashboard when the org has writing practice disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      organization: { id: 'org-1', writingPracticeEnabled: false },
    });

    await expect(
      loader({
        request: new Request('https://example.test/app/writing-lessons'),
        params: {},
        context: {} as never,
      } as any)
    ).rejects.toMatchObject({ status: 302 });
  });

  test('loads active classes for a teacher creating a practice assignment', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    classFindMany.mockResolvedValue([
      { id: 'class-1', title: 'English 9', grade: '9th', period: '1st' },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.isTeacher).toBe(true);
    expect(response.data.teacherClasses).toEqual([
      { id: 'class-1', title: 'English 9', grade: '9th', period: '1st' },
    ]);
    expect(classFindMany).toHaveBeenCalledWith({
      where: {
        teachers: { some: { id: 'teacher-1' } },
        isArchived: false,
        // The picker offers this year's classes, matching every other
        // teacher surface.
        schoolYear: expect.any(String),
      },
      orderBy: [{ title: 'asc' }, { grade: 'asc' }, { period: 'asc' }],
      select: { id: true, title: true, grade: true, period: true },
    });
  });

  test('returns the practice assigned to a student, with lesson titles resolved', async () => {
    listWritingPracticeAssignmentsForStudent.mockResolvedValue([
      {
        id: 'practice-1',
        title: 'Wordiness warm-up',
        lessonSlugs: ['revising-for-wordiness', 'not-a-real-lesson'],
        problemCount: 5,
        dueAt: new Date('2026-09-01T00:00:00.000Z'),
        instructions: 'Complete before class.',
        classes: [
          {
            id: 'class-1',
            title: 'English 9',
            grade: '9',
            period: '2',
            classAssignmentId: 'wpca-1',
          },
        ],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(listWritingPracticeAssignmentsForStudent).toHaveBeenCalledWith(
      'student-1'
    );
    expect(listWritingPracticeAssignmentsForTeacher).not.toHaveBeenCalled();
    expect(response.data.assignments).toEqual([
      {
        id: 'practice-1',
        title: 'Wordiness warm-up',
        problemCount: 5,
        dueAt: '9/1/2026',
        instructions: 'Complete before class.',
        lessons: [
          { slug: 'revising-for-wordiness', title: 'Revising for Wordiness' },
          { slug: 'not-a-real-lesson', title: 'not-a-real-lesson' },
        ],
        classes: [
          {
            id: 'class-1',
            label: 'English 9 · Grade 9 • Period 2',
            classAssignmentId: 'wpca-1',
          },
        ],
      },
    ]);
  });

  test('returns the practice a teacher assigned', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingPracticeEnabled: true },
    });
    classFindMany.mockResolvedValue([]);
    listWritingPracticeAssignmentsForTeacher.mockResolvedValue([
      {
        id: 'practice-2',
        title: 'Comma splices',
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 8,
        dueAt: new Date('2026-09-15T00:00:00.000Z'),
        instructions: null,
        classes: [
          {
            id: 'class-1',
            title: null,
            grade: '9',
            period: '2',
            classAssignmentId: 'wpca-2',
          },
        ],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(listWritingPracticeAssignmentsForTeacher).toHaveBeenCalledWith(
      'teacher-1'
    );
    expect(listWritingPracticeAssignmentsForStudent).not.toHaveBeenCalled();
    expect(response.data.assignments).toEqual([
      {
        id: 'practice-2',
        title: 'Comma splices',
        problemCount: 8,
        dueAt: '9/15/2026',
        instructions: null,
        lessons: [
          { slug: 'fixing-comma-splices', title: 'Fixing Comma Splices' },
        ],
        classes: [
          {
            id: 'class-1',
            label: 'Grade 9 • Period 2',
            classAssignmentId: 'wpca-2',
          },
        ],
      },
    ]);
  });

  test('carries the class-assignment id so a card can open the assignment itself', async () => {
    // The card used to link to /app/writing-lessons/<slug>, which is the
    // generic lesson, not the assigned set of problems. The runner and the
    // teacher results page are both keyed by the class-assignment id, so the
    // loader has to surface it.
    listWritingPracticeAssignmentsForStudent.mockResolvedValue([
      {
        id: 'practice-1',
        title: 'Comma splices',
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 5,
        dueAt: new Date('2026-09-01T00:00:00.000Z'),
        instructions: null,
        classes: [
          {
            id: 'class-1',
            title: 'English 9',
            grade: '9',
            period: '2',
            classAssignmentId: 'wpca-42',
          },
        ],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.assignments[0].classes[0].classAssignmentId).toBe(
      'wpca-42'
    );
  });

  test('hides the Composition section until its rollout flag is on', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';

    const offResponse = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(
      offResponse.data.sections.map((section) => section.section)
    ).not.toContain('Composition');

    process.env.COMPOSITION_PRACTICE_ENABLED = 'true';

    const onResponse = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(
      onResponse.data.sections.map((section) => section.section)
    ).toContain('Composition');
  });

  test('hides assignments containing Composition until its rollout flag is on', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'false';
    listWritingPracticeAssignmentsForStudent.mockResolvedValue([
      {
        id: 'grammar-practice',
        title: 'Comma splices',
        lessonSlugs: ['fixing-comma-splices'],
        problemCount: 3,
        dueAt: null,
        instructions: null,
        classes: [],
      },
      {
        id: 'composition-practice',
        title: 'Topic sentences',
        lessonSlugs: ['topic-sentences'],
        problemCount: 3,
        dueAt: null,
        instructions: null,
        classes: [],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.assignments.map((assignment) => assignment.id)).toEqual(
      ['grammar-practice']
    );
  });
});
