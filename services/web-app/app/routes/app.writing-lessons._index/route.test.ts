import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const classFindMany = mock();
const getAssignedPracticeForStudent = mock();
const getWritingPracticeAssignmentsForTeacher = mock();
const getStudentPreviewState = mock();

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
    getStudentPreviewState.mockReset().mockResolvedValue({ active: false });

    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      id: 'student-1',
      role: 'STUDENT',
      organization: { id: 'org-1', writingFundamentalsEnabled: true },
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

    expect(response.data.groups.length).toBeGreaterThan(0);
    expect(response.data.groups.some((group) => group.lessons.length > 0)).toBe(
      true
    );
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
});
