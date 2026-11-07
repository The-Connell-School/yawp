import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock();
const requireMembership = mock();
const assignmentTypeAvailableForTeacher = mock();
const findThesisEssayCourse = mock();
const getTeacherTrainingPlaybackUrl = mock();
const prisma = { teacherTrainingModule: { findFirst: mock() } };

mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/domain/assignment-types/available-for-teacher.server', () => ({ assignmentTypeAvailableForTeacher }));
mock.module('~/domain/teacher-trainings/thesis-essay-course.server', () => ({ findThesisEssayCourse, tutorialHrefs: () => ({}), tutorialHref: () => '' }));
mock.module('~/utils/teacher-training-video-link.server', () => ({ getTeacherTrainingPlaybackUrl }));

const { loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

const teacher = { id: 'teacher-1', role: 'TEACHER', organization: { id: 'org-1' } };

function open(lesson: string, id = 'at-1') {
  return loader({
    request: new Request(`http://localhost/app/assignment-types/${id}/tutorial/${lesson}`),
    params: { id, lesson },
    context: {},
  } as any);
}

async function thrown(promise: Promise<unknown>): Promise<{ status: number; headers: Headers }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Response) return error;
    return { status: (error as { init?: { status?: number } }).init?.status ?? 200, headers: new Headers() };
  }
  throw new Error('expected the loader to redirect or 404');
}

beforeEach(() => {
  requireUserId.mockReset().mockResolvedValue('user-1');
  requireMembership.mockReset().mockResolvedValue(teacher);
  assignmentTypeAvailableForTeacher.mockReset().mockResolvedValue(true);
  findThesisEssayCourse.mockReset().mockResolvedValue({
    courseId: 'course-1',
    coursePath: '/app/teacher-trainings/course-1',
    videoModules: { 2: 'm7' },
  });
  prisma.teacherTrainingModule.findFirst.mockReset().mockResolvedValue({
    title: 'Lesson 2: Pre-writing',
    videoS3Key: 'lounge/l2.mp4',
    videoDuration: 500,
  });
  getTeacherTrainingPlaybackUrl.mockReset().mockResolvedValue('https://videos.example/l2.mp4?sig');
});

describe('a lesson’s tutorial video on the assignment type’s page', () => {
  test('plays the Lounge module’s video for that lesson, under the type’s own access', async () => {
    expect(await open('2')).toEqual({
      pagePath: '/app/assignment-types/at-1',
      lessonNumber: 2,
      lessonTitle: 'Pre-writing',
      moduleTitle: 'Lesson 2: Pre-writing',
      videoUrl: 'https://videos.example/l2.mp4?sig',
      minutes: 8,
    });
    expect(assignmentTypeAvailableForTeacher).toHaveBeenCalledWith({
      assignmentTypeId: 'at-1',
      membershipId: 'teacher-1',
      organizationId: 'org-1',
    });
    expect(prisma.teacherTrainingModule.findFirst.mock.calls[0][0].where).toEqual({ id: 'm7', teacherTrainingId: 'course-1' });
    expect(getTeacherTrainingPlaybackUrl).toHaveBeenCalledWith('lounge/l2.mp4');
  });

  test('a video that cannot be signed leaves the page up with a note', async () => {
    getTeacherTrainingPlaybackUrl.mockResolvedValue(null);
    expect((await open('2')).videoUrl).toBeNull();
  });

  test('a lesson with no video module is a 404; so is a number off the course', async () => {
    expect((await thrown(open('3'))).status).toBe(404);
    expect((await thrown(open('9'))).status).toBe(404);
    expect((await thrown(open('x'))).status).toBe(404);
  });

  test('a type this teacher cannot open goes back to the app, as the guide does', async () => {
    assignmentTypeAvailableForTeacher.mockResolvedValue(false);
    const response = await thrown(open('2'));
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/app');
  });

  test('a student goes back to the app', async () => {
    requireMembership.mockResolvedValue({ ...teacher, role: 'STUDENT' });
    expect((await thrown(open('2'))).headers.get('location')).toBe('/app');
  });
});
