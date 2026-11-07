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
    // The rows link to the type's own tutorial page, never into the Lounge.
    expect(tutorialHrefs('at-1', course)).toEqual({
      1: '/app/assignment-types/at-1/tutorial/1',
      2: '/app/assignment-types/at-1/tutorial/2',
      3: '/app/assignment-types/at-1/tutorial/3',
      8: '/app/assignment-types/at-1/tutorial/8',
    });
    expect(tutorialHref('at-1', 2)).toBe('/app/assignment-types/at-1/tutorial/2');
    expect(tutorialHrefs('at-1', null)).toEqual({});
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
