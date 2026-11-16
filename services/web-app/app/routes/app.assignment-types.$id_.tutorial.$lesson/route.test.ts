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
    videoModules: { 2: 'm7', 8: 'm13' },
  });
  prisma.teacherTrainingModule.findFirst.mockReset().mockResolvedValue({
    title: 'Lesson 8: Review my Essay (optional)',
    videoS3Key: 'lounge/l8.mp4',
    videoDuration: 500,
  });
  getTeacherTrainingPlaybackUrl.mockReset().mockResolvedValue('https://videos.example/l8.mp4?sig');
});

const TUTORIALS = '/courses/thesis-driven-essay/tutorials';

describe('a lesson’s tutorial video on the assignment type’s page', () => {
  test('plays Brian’s video for that lesson from the app, under the type’s own access', async () => {
    expect(await open('2')).toEqual({
      pagePath: '/app/assignment-types/at-1',
      lessonNumber: 2,
      lessonTitle: 'Pre-writing',
      moduleTitle: null,
      videos: [
        {
          title: 'Pre-writing',
          src: `${TUTORIALS}/02-pre-writing.mp4`,
          poster: `${TUTORIALS}/02-pre-writing.jpg`,
          captions: `${TUTORIALS}/02-pre-writing.vtt`,
          minutes: 14,
        },
      ],
      minutes: 14,
    });
    expect(assignmentTypeAvailableForTeacher).toHaveBeenCalledWith({
      assignmentTypeId: 'at-1',
      membershipId: 'teacher-1',
      organizationId: 'org-1',
    });
    // His video comes with the app: the Lounge is not asked, even though it
    // has an older video for this lesson.
    expect(findThesisEssayCourse).not.toHaveBeenCalled();
    expect(getTeacherTrainingPlaybackUrl).not.toHaveBeenCalled();
  });

  test('Body paragraphs has two: the paragraphs, then supporting quotes', async () => {
    const page = await open('5');
    expect(page.videos.map((video) => [video.title, video.src])).toEqual([
      ['Body paragraphs', `${TUTORIALS}/05-body-paragraphs.mp4`],
      ['Supporting quotes', `${TUTORIALS}/05-supporting-quotes.mp4`],
    ]);
    expect(page.minutes).toBe(16);
  });

  test('a lesson Brian has not recorded plays its Lounge module’s video', async () => {
    expect(await open('8')).toEqual({
      pagePath: '/app/assignment-types/at-1',
      lessonNumber: 8,
      lessonTitle: 'Review my essay',
      moduleTitle: 'Lesson 8: Review my Essay (optional)',
      videos: [
        {
          title: 'Review my essay',
          src: 'https://videos.example/l8.mp4?sig',
          poster: null,
          captions: null,
          minutes: 8,
        },
      ],
      minutes: 8,
    });
    expect(prisma.teacherTrainingModule.findFirst.mock.calls[0][0].where).toEqual({ id: 'm13', teacherTrainingId: 'course-1' });
    expect(getTeacherTrainingPlaybackUrl).toHaveBeenCalledWith('lounge/l8.mp4');
  });

  test('a Lounge video that cannot be signed leaves the page up with a note', async () => {
    getTeacherTrainingPlaybackUrl.mockResolvedValue(null);
    expect((await open('8')).videos).toEqual([]);
  });

  test('a lesson with no video anywhere is a 404; so is a number off the course', async () => {
    findThesisEssayCourse.mockResolvedValue(null);
    expect((await thrown(open('8'))).status).toBe(404);
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
