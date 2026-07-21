import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const getAssignedPracticeForStudent = mock();
const getWritingPracticeAssignmentsForTeacher = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: classFindMany } },
}));
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  getAssignedPracticeForStudent,
  getWritingPracticeAssignmentsForTeacher,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

describe('writing lessons index route', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    requireMembership.mockReset();
    classFindMany.mockReset();
    getAssignedPracticeForStudent.mockReset();
    getWritingPracticeAssignmentsForTeacher.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1' },
    });
    classFindMany.mockResolvedValue([]);
    getAssignedPracticeForStudent.mockResolvedValue([]);
    getWritingPracticeAssignmentsForTeacher.mockResolvedValue([]);
  });

  test('loads by direct URL', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.sections.length).toBeGreaterThan(0);
    expect(
      response.data.sections.some((section) =>
        section.groups.some((group) => group.lessons.length > 0)
      )
    ).toBe(true);
    // Grammar & Mechanics is always present; Composition appears when enabled.
    expect(
      response.data.sections.some(
        (section) => section.section === 'Grammar & Mechanics'
      )
    ).toBe(true);
  });

  test('surfaces a student’s assigned practice with a lesson-derived title', async () => {
    getAssignedPracticeForStudent.mockResolvedValue([
      {
        id: 'wpca-1',
        assignment: {
          title: null,
          lessonSlugs: ['topic-sentences'],
          problemCount: 3,
          dueAt: new Date('2026-12-01T00:00:00Z'),
        },
        attempts: [],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.assignedPractice).toHaveLength(1);
    expect(response.data.assignedPractice[0].id).toBe('wpca-1');
    // Untitled assignment falls back to the assigned lesson's name.
    expect(response.data.assignedPractice[0].title).toBe('Topic Sentences');
    expect(response.data.assignedPractice[0].problemCount).toBe(3);
  });

  test('teachers can assign composition skills; the student session builder stays ACT-only', async () => {
    process.env.COMPOSITION_PRACTICE_ENABLED = 'true';
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1' },
    });
    classFindMany.mockResolvedValue([]);

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    const assignableSlugs = response.data.writingPracticeLessons.map(
      (lesson) => lesson.slug
    );
    expect(assignableSlugs).toContain('fixing-comma-splices');
    expect(assignableSlugs).toContain('topic-sentences');
    expect(assignableSlugs).toContain('conclusions');

    // The self-directed ACT session builder still lists grammar skills only.
    const sessionSlugs = response.data.practiceSkillOptions.map(
      (lesson) => lesson.slug
    );
    expect(sessionSlugs).toContain('fixing-comma-splices');
    expect(sessionSlugs).not.toContain('topic-sentences');
  });
});
