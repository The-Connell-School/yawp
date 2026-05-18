import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
};

const requireUserId = mock();
const requireProfile = mock();
const loadStudentPileContents = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/services/released-grades.server', () => ({
  loadStudentPileContents,
}));

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

describe('student-contents resource loader', () => {
  beforeEach(() => {
    prisma.class.findFirst.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    loadStudentPileContents.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'p_1',
      teacherProfile: { id: 'tp_1' },
    });
  });

  test('returns rows from loadStudentPileContents', async () => {
    prisma.class.findFirst.mockResolvedValue({ id: 'c_1' });
    loadStudentPileContents.mockResolvedValue([
      {
        submissionId: 's_1',
        assignmentTypeId: 'at_1',
        assignmentTypeTitle: 'Macbeth Essay',
        grade: 92,
        releasedAt: new Date('2026-05-01'),
      },
    ]);
    const res = await loader({
      request: new Request(
        'https://x.test/app/my-classes/c_1/released-grades/student/sp_1'
      ),
      params: { classId: 'c_1', studentProfileId: 'sp_1' },
      context: {} as never,
    });
    const data = (res as { data: any }).data;
    expect(data.rows).toHaveLength(1);
  });

  test('404s when teacher does not own the class', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request(
          'https://x.test/app/my-classes/c_1/released-grades/student/sp_1'
        ),
        params: { classId: 'c_1', studentProfileId: 'sp_1' },
        context: {} as never,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown!.status).toBe(404);
  });
});
