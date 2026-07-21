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
