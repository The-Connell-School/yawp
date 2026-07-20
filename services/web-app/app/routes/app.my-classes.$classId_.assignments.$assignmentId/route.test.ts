import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findFirst: mock() },
  classAssignmentInsight: { findUnique: mock() },
  class: { findFirst: mock() },
  document: { findMany: mock() },
  submission: { findMany: mock() },
};

const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireMembership,
}));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

describe('assignment submissions loader', () => {
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
      organization: { id: 'org-1', name: 'Org' },
    });
    prisma.class.findFirst.mockResolvedValue({
      id: 'class-1',
      grade: '9',
      period: '2',
      school: { id: 'school-1', name: 'Tallassee High School', organizationId: 'org-1' },
    });
    prisma.classAssignment.findFirst.mockResolvedValue({
      id: 'class-assignment-1',
      assignment: {
        id: 'assignment-1',
        title: 'Essay',
        submitForGrade: true,
        pointValue: 100,
        assignmentType: { title: 'Essay' },
      },
    });
    prisma.submission.findMany.mockResolvedValue([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);
    prisma.document.findMany.mockResolvedValue([
      { id: 'draft-1', title: 'Draft essay' },
    ]);
    prisma.classAssignmentInsight.findUnique.mockResolvedValue(null);
  });

  test('keeps submitted assignment work visible', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1/assignments/assignment-1?status=submitted'
      ),
      params: { classId: 'class-1', assignmentId: 'assignment-1' },
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.submissions).toEqual([
      { id: 'submission-1', title: 'Submitted essay' },
    ]);
    expect(prisma.submission.findMany).toHaveBeenCalledTimes(1);
  });

  test('keeps in-progress assignment drafts visible', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/app/my-classes/class-1/assignments/assignment-1?status=in-progress'
      ),
      params: { classId: 'class-1', assignmentId: 'assignment-1' },
      context: {} as never,
    } as any);
    const data = (response as { data: any }).data;

    expect(data.inProgressDocuments).toEqual([
      { id: 'draft-1', title: 'Draft essay' },
    ]);
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
  });
});
