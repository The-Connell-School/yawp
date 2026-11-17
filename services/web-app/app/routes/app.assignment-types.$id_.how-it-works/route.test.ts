import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const assignmentTypeAvailableForTeacher = mock();
const userHasPendingFreeTierTeachingLock = mock();
const isAssignmentTypeHowToTeachLockedForTeacher = mock();
const getAssignmentTypeLandingFlags = mock();
const findThesisEssayCourse = mock();
const getLessonMaterialsForAssignmentType = mock();

const prisma = {
  assignmentType: { findFirst: mock() },
};

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/assignment-types/available-for-teacher.server', () => ({
  assignmentTypeAvailableForTeacher,
}));
mock.module('~/domain/free-tier/locked-preview.server', () => ({
  userHasPendingFreeTierTeachingLock,
}));
mock.module('~/domain/free-tier/site-license-how-to-teach.server', () => ({
  isAssignmentTypeHowToTeachLockedForTeacher,
}));
mock.module('~/domain/assignment-types/landing-page-gate.server', () => ({
  getAssignmentTypeLandingFlags,
}));
mock.module('~/domain/teacher-trainings/thesis-essay-course.server', () => ({
  findThesisEssayCourse,
  tutorialHrefs: () => ({}),
}));
mock.module('~/domain/assignment-types/lesson-materials.server', () => ({
  getLessonMaterialsForAssignmentType,
}));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

const thesisType = {
  id: 'tde-1',
  title: 'The Thesis-Driven Essay',
  kind: null,
  systemKey: null,
};

const freeTeacher = {
  id: 'teacher-1',
  role: 'TEACHER' as const,
  organization: { id: 'org-1', plan: 'FREE_CLASSROOM' as const },
};

async function thrown(promise: Promise<unknown>): Promise<Response> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error('expected redirect');
}

function load(id = thesisType.id) {
  return loader({
    request: new Request(`http://localhost/app/assignment-types/${id}/how-it-works`),
    params: { id },
    context: {},
  } as any);
}

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue(freeTeacher);
  assignmentTypeAvailableForTeacher.mockReset().mockResolvedValue(false);
  userHasPendingFreeTierTeachingLock.mockReset().mockResolvedValue(false);
  isAssignmentTypeHowToTeachLockedForTeacher.mockReset().mockResolvedValue(true);
  getAssignmentTypeLandingFlags.mockReset().mockResolvedValue({ v2: true });
  findThesisEssayCourse.mockReset().mockResolvedValue(null);
  getLessonMaterialsForAssignmentType.mockReset().mockResolvedValue(null);
  prisma.assignmentType.findFirst.mockReset().mockResolvedValue(thesisType);
});

describe('how-it-works loader for site-license locked types', () => {
  test('approved free classroom teacher can open the thesis guide when the type is not entitled', async () => {
    const data = await load();
    expect(data.guide).toBe('thesis-essay');
    expect(data.howToTeachAssetsLocked).toBe(true);
    expect(assignmentTypeAvailableForTeacher).toHaveBeenCalled();
  });

  test('redirects to /app when the type is unavailable and not a site-license browse tile', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'other-1',
      title: 'Class Starter',
      kind: 'class_starter',
      systemKey: null,
    });
    const response = await thrown(load('other-1'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });
});