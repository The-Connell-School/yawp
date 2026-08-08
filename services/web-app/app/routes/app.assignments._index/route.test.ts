import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  classAssignment: { findMany: mock() },
};
const requireUserId = mock();
const requireMembership = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { loader } = await import('./route');

function makeRequest() {
  return new Request('https://example.test/app/assignments');
}

describe('My Assignments loader', () => {
  beforeEach(() => {
    prisma.classAssignment.findMany.mockReset();
    requireUserId.mockReset();
    requireMembership.mockReset();
    requireUserId.mockResolvedValue('user-1');
  });

  test('redirects non-teachers to the dashboard', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'STUDENT' });

    const response = await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe('/app');
    expect(prisma.classAssignment.findMany).not.toHaveBeenCalled();
  });

  test('scopes assignments to classes the teacher teaches', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-1',
        class: { id: 'class-1', grade: '9th', period: '1st', title: null },
        assignment: {
          id: 'assignment-1',
          title: 'Essay One',
          assignmentType: { title: 'Essay' },
          _count: { documents: 3 },
        },
      },
    ]);

    const result = await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any);

    expect(prisma.classAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          class: {
            teachers: { some: { id: 'profile-1' } },
            isArchived: false,
          },
        },
      })
    );
    expect(result).toEqual({
      assignments: [
        {
          classAssignmentId: 'ca-1',
          assignmentId: 'assignment-1',
          title: 'Essay One',
          assignmentTypeTitle: 'Essay',
          documentCount: 3,
          classId: 'class-1',
          classLabel: 'Grade 9th • Period 1st',
        },
      ],
    });
  });

  test('falls back to "Untitled Assignment" when the title is blank', async () => {
    requireMembership.mockResolvedValue({ id: 'profile-1', role: 'TEACHER' });
    prisma.classAssignment.findMany.mockResolvedValue([
      {
        id: 'ca-2',
        class: { id: 'class-2', grade: '10th', period: '2nd', title: 'Honors' },
        assignment: {
          id: 'assignment-2',
          title: '   ',
          assignmentType: { title: 'Prompt' },
          _count: { documents: 0 },
        },
      },
    ]);

    const result = (await loader({
      request: makeRequest(),
      params: {},
      context: {},
    } as any)) as { assignments: { title: string; classLabel: string }[] };

    expect(result.assignments[0].title).toBe('Untitled Assignment');
    expect(result.assignments[0].classLabel).toBe(
      'Honors · Grade 10th • Period 2nd'
    );
  });
});
