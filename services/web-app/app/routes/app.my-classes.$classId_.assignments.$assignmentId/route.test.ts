import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignment: { findFirst: mock() },
  class: { findFirst: mock() },
  document: { findMany: mock() },
  submission: { findMany: mock() },
};

const requireUserId = mock();
const requireProfile = mock();
const isDocumentSubmissionEnabledForScope = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/feature-flags.server', () => ({
  isDocumentSubmissionEnabledForScope,
}));

const { loader } = await import('./route');

describe('assignment submissions loader', () => {
  beforeEach(() => {
    for (const model of Object.values(prisma)) {
      for (const fn of Object.values(model)) fn.mockReset();
    }
    requireUserId.mockReset();
    requireProfile.mockReset();
    isDocumentSubmissionEnabledForScope.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      teacherProfile: { id: 'teacher-1' },
    });
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      grade: '9',
      period: '2',
      school: { id: 'school-1', name: 'Tallassee High School' },
    });
    prisma.assignment.findFirst.mockResolvedValue({
      id: 'assignment-1',
      title: 'Essay',
      dueDate: null,
      assignmentType: { title: 'Essay' },
    });
    prisma.submission.findMany.mockResolvedValue([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);
    prisma.document.findMany.mockResolvedValue([
      { id: 'draft-1', title: 'Draft essay' },
    ]);
    isDocumentSubmissionEnabledForScope.mockResolvedValue(false);
  });

  test('keeps submitted assignment work visible after document submission grading is disabled', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1/assignments/assignment-1?status=submitted'
      ),
      params: { classId: 'class-1', assignmentId: 'assignment-1' },
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.isDocumentSubmissionEnabled).toBe(false);
    expect(data.submissions).toEqual([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  test('keeps in-progress assignment drafts visible after document submission grading is disabled', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1/assignments/assignment-1?status=in-progress'
      ),
      params: { classId: 'class-1', assignmentId: 'assignment-1' },
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.isDocumentSubmissionEnabled).toBe(false);
    expect(data.inProgressDocuments).toEqual([
      { id: 'draft-1', title: 'Draft essay' },
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
  });
});
