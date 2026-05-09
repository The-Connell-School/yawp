import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findFirst: mock() },
  studentProfile: { findMany: mock() },
};

const requireUserId = mock();
const requireProfile = mock();
const isReleasedGradesOrganizationEnabledForOrganization = mock();
const loadPiles = mock();
const loadStudentPiles = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/utils/feature-flags.server', () => ({
  isReleasedGradesOrganizationEnabledForOrganization,
}));
mock.module('~/services/released-grades.server', () => ({
  loadPiles,
  loadStudentPiles,
}));

const { loader } = await import('./route');

describe('released-grades loader', () => {
  beforeEach(() => {
    prisma.class.findFirst.mockReset();
    prisma.studentProfile.findMany.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    isReleasedGradesOrganizationEnabledForOrganization.mockReset();
    loadPiles.mockReset();
    loadStudentPiles.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'p_1',
      teacherProfile: { id: 'tp_1' },
    });
    prisma.studentProfile.findMany.mockResolvedValue([]);
    isReleasedGradesOrganizationEnabledForOrganization.mockResolvedValue(true);
  });

  test('404s when class is not found or teacher does not own it', async () => {
    prisma.class.findFirst.mockResolvedValue(null);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request(
          'https://x.test/app/my-classes/c_1/released-grades'
        ),
        params: { classId: 'c_1' },
        context: {} as never,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.status).toBe(404);
  });

  test('redirects to old class view when feature flag is OFF', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'c_1',
      title: 'A',
      grade: '9th',
      period: '1st',
      school: { organizationId: 'org_1' },
    });
    isReleasedGradesOrganizationEnabledForOrganization.mockResolvedValue(false);
    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request(
          'https://x.test/app/my-classes/c_1/released-grades'
        ),
        params: { classId: 'c_1' },
        context: {} as never,
      });
    } catch (r) {
      thrown = r as Response;
    }
    expect(thrown).not.toBeNull();
    expect(thrown!.status).toBe(302);
    expect(thrown!.headers.get('Location')).toBe('/app/my-classes/c_1');
  });

  test('returns piles with view=byAssignment by default', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'c_1',
      title: 'A',
      grade: '9th',
      period: '1st',
      school: { organizationId: 'org_1' },
    });
    loadPiles.mockResolvedValue([
      {
        assignmentTypeId: 'at_1',
        title: 'Macbeth Essay',
        count: 23,
        mostRecentReleasedAt: new Date('2026-05-01'),
      },
    ]);
    const result = await loader({
      request: new Request('https://x.test/app/my-classes/c_1/released-grades'),
      params: { classId: 'c_1' },
      context: {} as never,
    });
    const data = (result as { data: any }).data;
    expect(data.view).toBe('byAssignment');
    expect(data.piles).toHaveLength(1);
    expect(data.piles[0].title).toBe('Macbeth Essay');
    expect(data.className).toBe('A');
    expect(data.studentOptions).toEqual([]);
  });

  test('uses grade and period as class name fallback when title is blank', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'c_1',
      title: null,
      grade: '9th',
      period: '1st',
      school: { organizationId: 'org_1' },
    });
    loadPiles.mockResolvedValue([]);
    const result = await loader({
      request: new Request('https://x.test/app/my-classes/c_1/released-grades'),
      params: { classId: 'c_1' },
      context: {} as never,
    });
    const data = (result as { data: any }).data;
    expect(data.className).toBe('Grade 9th • Period 1st');
  });

  test('returns student piles when ?view=byStudent', async () => {
    prisma.class.findFirst.mockResolvedValue({
      id: 'c_1',
      title: 'A',
      grade: '9th',
      period: '1st',
      school: { organizationId: 'org_1' },
    });
    loadStudentPiles.mockResolvedValue([
      {
        studentProfileId: 'sp_1',
        studentName: 'Jamie Lopez',
        count: 4,
        mostRecentReleasedAt: new Date('2026-05-01'),
      },
    ]);
    const result = await loader({
      request: new Request(
        'https://x.test/app/my-classes/c_1/released-grades?view=byStudent'
      ),
      params: { classId: 'c_1' },
      context: {} as never,
    });
    const data = (result as { data: any }).data;
    expect(data.view).toBe('byStudent');
    expect(data.studentPiles).toHaveLength(1);
  });
});
