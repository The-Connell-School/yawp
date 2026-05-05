import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
};

const requireUserId = mock();
const requireProfile = mock();
const loadPileContents = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/services/released-grades.server', () => ({
  loadPileContents,
}));

const { loader } = await import('./route');

describe('pile-contents resource loader', () => {
  beforeEach(() => {
    prisma.class.findFirst.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    loadPileContents.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'p_1',
      teacherProfile: { id: 'tp_1' },
    });
  });

  test('404s if teacher does not own class', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request(
          'https://x.test/app/my-classes/c_1/released-grades/pile/at_1'
        ),
        params: { classId: 'c_1', assignmentTypeId: 'at_1' },
        context: {} as never,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown!.status).toBe(404);
  });

  test('returns rows from loadPileContents with default pagination', async () => {
    prisma.class.findFirst.mockResolvedValue({ id: 'c_1' });
    loadPileContents.mockResolvedValue([
      {
        submissionId: 's_1',
        studentProfileId: 'sp_1',
        studentName: 'Jamie Lopez',
        grade: 89,
        releasedAt: new Date('2026-05-01'),
      },
    ]);
    const res = await loader({
      request: new Request(
        'https://x.test/app/my-classes/c_1/released-grades/pile/at_1'
      ),
      params: { classId: 'c_1', assignmentTypeId: 'at_1' },
      context: {} as never,
    });
    const data = (res as { data: any }).data;
    expect(data.rows).toHaveLength(1);
    expect(loadPileContents.mock.calls[0]![0]).toMatchObject({
      classId: 'c_1',
      assignmentTypeId: 'at_1',
      take: 50,
      skip: 0,
    });
  });
});
