import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock(async () => 'user-1');
const requireMembership = mock(async () => ({
  id: 'mem-1',
  role: 'TEACHER',
  organization: { id: 'org-1' },
}));
const isLoungeCommunityEnabled = mock(async () => false);
const redirectIfTeacherLoungeTemporarilyDisabled = mock(async () => {});

const userFindUnique = mock(async ({ select }: { select?: Record<string, boolean> }) => {
  if (select?.isAdmin) return { isAdmin: false };
  if (select?.email) return { email: 'teacher@example.com' };
  return null;
});

const teacherTrainingFindMany = mock(async () => [
  {
    id: 'course-1',
    title: 'E2E Teacher Lounge',
    description: 'Test course',
    teacherTrainingModules: [],
    resources: [],
    image: null,
  },
]);

const prisma = {
  user: { findUnique: userFindUnique },
  orgMembership: {
    findUnique: mock(async () => ({
      _count: { assignedTeacherTrainings: 0 },
    })),
  },
  teacherTraining: { findMany: teacherTrainingFindMany },
};

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isLoungeCommunityEnabled,
}));
mock.module('~/domain/teacher-lounge/teacher-lounge-temporary-disable.server', () => ({
  redirectIfTeacherLoungeTemporarilyDisabled,
}));

const { loader } = await import('./route');

describe('teacher trainings index', () => {
  beforeEach(() => {
    isLoungeCommunityEnabled.mockReset();
    teacherTrainingFindMany.mockClear();
    isLoungeCommunityEnabled.mockResolvedValue(false);
  });

  test('community on: sends teachers to the Faculty Lounge feed', async () => {
    isLoungeCommunityEnabled.mockResolvedValue(true);
    const response = await loader({
      request: new Request('http://test/app/teacher-trainings'),
    } as never).catch((error) => error);

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/app/lounge');
    expect(teacherTrainingFindMany).not.toHaveBeenCalled();
  });

  test('community off: still loads the course grid', async () => {
    const response = await loader({
      request: new Request('http://test/app/teacher-trainings'),
    } as never);

    expect(response.data.teacherTrainings).toHaveLength(1);
    expect(response.data.teacherTrainings[0].id).toBe('course-1');
  });
});