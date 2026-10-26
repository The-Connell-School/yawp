import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const orgMembershipFindUnique = mock();
const moduleFindFirst = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    orgMembership: { findUnique: orgMembershipFindUnique },
    teacherTrainingModule: { findFirst: moduleFindFirst },
  },
}));

const { getLessonMaterialsForAssignmentType } = await import(
  './lesson-materials.server'
);

afterAll(() => {
  mock.restore();
});

describe('getLessonMaterialsForAssignmentType', () => {
  beforeEach(() => {
    orgMembershipFindUnique.mockReset();
    moduleFindFirst.mockReset();

    orgMembershipFindUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 0 },
    });
    moduleFindFirst.mockResolvedValue({
      id: 'module-2',
      title: 'Lesson 2: Pre-writing',
      videoS3Key: 'teacher-trainings/t/modules/m/video/pre-writing.mp4',
      teacherTraining: { id: 'training-1', title: 'The Thesis-Driven Essay' },
      resources: [
        {
          id: 'deck',
          name: 'Pre-Writing Slide Deck.pptx',
          contentType:
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        },
      ],
    });
  });

  test('returns the lesson and its materials for Prewriting', async () => {
    const result = await getLessonMaterialsForAssignmentType(
      'prewriting',
      'teacher-1'
    );

    expect(result).toEqual({
      lessonTitle: 'Lesson 2: Pre-writing',
      courseTitle: 'The Thesis-Driven Essay',
      lessonPath: '/app/teacher-trainings/training-1/modules/module-2',
      materials: [
        {
          kind: 'slide-deck',
          label: 'Slide deck',
          href: '/api/teacher-training-module-resource/deck',
        },
        {
          kind: 'video',
          label: 'Tutorial video',
          href: '/app/teacher-trainings/training-1/modules/module-2',
        },
      ],
    });
    expect(moduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          title: { contains: 'Pre-writing', mode: 'insensitive' },
          teacherTraining: {
            title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' },
          },
        }),
      })
    );
  });

  test('keeps to the courses assigned to a teacher who has some', async () => {
    orgMembershipFindUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 2 },
    });

    await getLessonMaterialsForAssignmentType('thesis_statement', 'teacher-1');

    expect(moduleFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          title: {
            contains: 'Developing a Thesis Statement',
            mode: 'insensitive',
          },
          teacherTraining: {
            title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' },
            assignedTeachers: { some: { id: 'teacher-1' } },
          },
        }),
      })
    );
  });

  test('returns null for a type with no lesson, without a lookup', async () => {
    expect(
      await getLessonMaterialsForAssignmentType('class_starter', 'teacher-1')
    ).toBeNull();
    expect(moduleFindFirst).not.toHaveBeenCalled();
  });

  test('returns null when the lesson is missing or has nothing to show', async () => {
    moduleFindFirst.mockResolvedValue(null);
    expect(
      await getLessonMaterialsForAssignmentType('prewriting', 'teacher-1')
    ).toBeNull();

    moduleFindFirst.mockResolvedValue({
      id: 'module-2',
      title: 'Lesson 2: Pre-writing',
      videoS3Key: null,
      teacherTraining: { id: 'training-1', title: 'The Thesis-Driven Essay' },
      resources: [],
    });
    expect(
      await getLessonMaterialsForAssignmentType('prewriting', 'teacher-1')
    ).toBeNull();
  });

  test('never lets a failed lookup break the page', async () => {
    moduleFindFirst.mockRejectedValue(new Error('db down'));
    expect(
      await getLessonMaterialsForAssignmentType('prewriting', 'teacher-1')
    ).toBeNull();
  });
});
