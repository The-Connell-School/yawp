import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  orgMembership: { findUnique: mock() },
  teacherTraining: { findFirst: mock() },
};
mock.module('~/utils/db.server', () => ({ prisma }));

const { findThesisEssayCourse, tutorialHref, tutorialHrefs } = await import('./thesis-essay-course.server');

afterAll(() => {
  mock.restore();
});

beforeEach(() => {
  prisma.orgMembership.findUnique.mockReset().mockResolvedValue({ _count: { assignedTeacherTrainings: 0 } });
  prisma.teacherTraining.findFirst.mockReset();
});

describe('the Thesis-Driven Essay course in the Teachers’ Lounge', () => {
  test('finds the course and each lesson’s video module by its "Lesson N:" title', async () => {
    prisma.teacherTraining.findFirst.mockResolvedValue({
      id: 'course-1',
      teacherTrainingModules: [
        { id: 'm0', title: 'Meet Your Instructor' },
        { id: 'm6', title: 'Lesson 1: Introduce Students to Yawp!' },
        { id: 'm7', title: 'Lesson 2: Pre-writing' },
        { id: 'm8', title: 'Lesson 3: Developing a Thesis Statement' },
        { id: 'm13', title: 'Lesson 8: Review my Essay (optional)' },
      ],
    });
    const course = await findThesisEssayCourse('teacher-1');
    expect(course).toEqual({
      courseId: 'course-1',
      coursePath: '/app/teacher-trainings/course-1',
      videoModules: { 1: 'm6', 2: 'm7', 3: 'm8', 8: 'm13' },
    });
    expect(tutorialHref('at-1', 2)).toBe('/app/assignment-types/at-1/tutorial/2');
    // Only modules with a video, in order, by the course's title.
    const args = prisma.teacherTraining.findFirst.mock.calls[0][0];
    expect(args.where.title).toEqual({ equals: 'The Thesis-Driven Essay', mode: 'insensitive' });
    expect(args.where.assignedTeachers).toBeUndefined();
    expect(args.select.teacherTrainingModules.where).toEqual({ videoS3Key: { not: null } });
  });

  test('a teacher with assigned courses sees it only when it is one of theirs', async () => {
    prisma.orgMembership.findUnique.mockResolvedValue({ _count: { assignedTeacherTrainings: 2 } });
    prisma.teacherTraining.findFirst.mockResolvedValue(null);
    expect(await findThesisEssayCourse('teacher-1')).toBeNull();
    expect(prisma.teacherTraining.findFirst.mock.calls[0][0].where.assignedTeachers).toEqual({
      some: { id: 'teacher-1' },
    });
  });

  test('no course, no links', async () => {
    prisma.teacherTraining.findFirst.mockResolvedValue(null);
    expect(await findThesisEssayCourse('teacher-1')).toBeNull();
  });
});

describe('the "Watch tutorial" links on How to Teach It', () => {
  const page = (lesson: number) => `/app/assignment-types/at-1/tutorial/${lesson}`;
  const brians = { 1: page(1), 2: page(2), 3: page(3), 4: page(4), 5: page(5), 6: page(6), 7: page(7) };

  test('every lesson with one of Brian’s videos has a link, Lounge course or not', () => {
    // A free-tier teacher has no Lounge course and still gets the videos.
    expect(tutorialHrefs('at-1', null)).toEqual(brians);
    expect(tutorialHrefs('at-1', { courseId: 'c', coursePath: '/app/teacher-trainings/c', videoModules: {} })).toEqual(brians);
  });

  test('a lesson without one (Review my essay) keeps its Lounge video, where the teacher has it', () => {
    const course = { courseId: 'c', coursePath: '/app/teacher-trainings/c', videoModules: { 2: 'm7', 8: 'm13' } };
    // Each row links to the type's own tutorial page, never into the Lounge.
    expect(tutorialHrefs('at-1', course)).toEqual({ ...brians, 8: page(8) });
  });
});
