import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const getAssignedPracticeForStudent = mock();
const getWritingPracticeAssignmentsForTeacher = mock();
const computeAssignedProgress = mock();
const getStudentPreviewState = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany: classFindMany } },
}));
mock.module('~/utils/writing-lessons/practice-assignments.server', () => ({
  computeAssignedProgress,
  getAssignedPracticeForStudent,
  getWritingPracticeAssignmentsForTeacher,
}));
mock.module('~/utils/student-preview.server', () => ({
  getStudentPreviewState,
  shouldUseStudentExperience: ({
    membershipRole,
    previewActive,
  }: {
    membershipRole: string;
    previewActive: boolean;
  }) => membershipRole === 'STUDENT' || previewActive,
}));

const { assignedPracticeProgressLabels, loader } = await import('./route');

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
    computeAssignedProgress.mockReset().mockReturnValue({
      attemptedCount: 0,
      masteredCount: 0,
      doneCount: 0,
    });
    getStudentPreviewState.mockReset().mockResolvedValue({ active: false });

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: {
        id: 'org-1',
        writingFundamentalsEnabled: true,
        compositionDrillsEnabled: true,
      },
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
    expect(
      response.data.sections.some(
        (section) => section.section === 'Grammar & Mechanics'
      )
    ).toBe(true);
    expect(
      response.data.sections.some(
        (section) => section.section === 'Composition'
      )
    ).toBe(true);
  });

  test('uses consistent status and action labels for assigned practice progress', () => {
    expect(assignedPracticeProgressLabels(0, 4)).toEqual({
      status: 'Not started',
      action: 'Start',
    });
    expect(assignedPracticeProgressLabels(2, 4)).toEqual({
      status: 'In progress',
      action: 'Continue',
    });
    expect(assignedPracticeProgressLabels(4, 4)).toEqual({
      status: 'Complete',
      action: 'Review',
    });
  });

  test('keeps generated and assigned practice off when the organization gate is disabled', async () => {
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingFundamentalsEnabled: false },
    });

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.writingFundamentalsEnabled).toBe(false);
    expect(response.data.assignedPractice).toEqual([]);
    expect(getAssignedPracticeForStudent).not.toHaveBeenCalled();
  });

  test('serves the student experience to a teacher in read-only preview', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: { id: 'org-1', writingFundamentalsEnabled: true },
    });
    getStudentPreviewState.mockResolvedValue({ active: true });

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.isTeacher).toBe(false);
    expect(classFindMany).not.toHaveBeenCalled();
    expect(getWritingPracticeAssignmentsForTeacher).not.toHaveBeenCalled();
  });

  test('teachers can assign composition skills; the student session builder stays ACT-only', async () => {
    requireMembership.mockResolvedValue({
      id: 'teacher-1',
      role: 'TEACHER',
      organization: {
        id: 'org-1',
        writingFundamentalsEnabled: true,
        compositionDrillsEnabled: true,
      },
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
    expect(assignableSlugs).toContain('paragraph-transitions');
    expect(assignableSlugs).toContain('evidence');
    expect(assignableSlugs).toContain('analysis');
    expect(assignableSlugs).not.toContain('conclusions');
    expect(
      response.data.writingPracticeLessons.every(
        (lesson) =>
          Object.keys(lesson).sort().join(',') === 'category,slug,title'
      )
    ).toBe(true);

    // The self-directed ACT session builder still lists grammar skills only.
    const sessionSlugs = response.data.practiceSkillOptions.map(
      (lesson) => lesson.slug
    );
    expect(sessionSlugs).toContain('fixing-comma-splices');
    expect(sessionSlugs).not.toContain('topic-sentences');
  });

  test('uses collapsed per-position progress instead of counting revisions', async () => {
    getAssignedPracticeForStudent.mockResolvedValue([
      {
        id: 'composition-assignment-1',
        assignment: {
          title: 'Composition',
          problemCount: 3,
          dueAt: null,
        },
        attempts: [
          {
            position: 1,
            lessonSlug: 'topic-sentences',
            status: 'developing',
          },
          {
            position: 1,
            lessonSlug: 'topic-sentences',
            status: 'strong',
          },
        ],
      },
    ]);
    computeAssignedProgress.mockReturnValue({
      attemptedCount: 1,
      masteredCount: 1,
      doneCount: 1,
    });

    const response = await loader({
      request: new Request('https://example.test/app/writing-lessons'),
      params: {},
      context: {} as never,
    } as any);

    expect(computeAssignedProgress).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ position: 1, status: 'developing' }),
        expect.objectContaining({ position: 1, status: 'strong' }),
      ])
    );
    expect(response.data.assignedPractice[0].completedCount).toBe(1);
  });
});
