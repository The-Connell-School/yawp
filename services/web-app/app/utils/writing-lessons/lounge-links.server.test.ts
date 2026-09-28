import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const orgMembershipFindUnique = mock();
const moduleFindFirst = mock();

mock.module('~/utils/db.server', () => ({
  prisma: {
    orgMembership: { findUnique: orgMembershipFindUnique },
    teacherTrainingModule: { findFirst: moduleFindFirst },
  },
}));

const { getLoungeModuleLinkForLesson } = await import('./lounge-links.server');

afterAll(() => {
  mock.restore();
});

describe('getLoungeModuleLinkForLesson', () => {
  beforeEach(() => {
    orgMembershipFindUnique.mockReset();
    moduleFindFirst.mockReset();

    orgMembershipFindUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 0 },
    });
    moduleFindFirst.mockResolvedValue({
      id: 'module-1',
      title: 'Lesson 3: Developing a Thesis Statement',
      teacherTraining: { id: 'training-1', title: 'The Thesis-Driven Essay' },
    });
  });

  test('returns null for a lesson with no Lounge mapping', async () => {
    const link = await getLoungeModuleLinkForLesson(
      'fixing-comma-splices',
      'teacher-1'
    );

    expect(link).toBeNull();
    expect(moduleFindFirst).not.toHaveBeenCalled();
  });

  test('resolves a composition lesson to its Lounge module', async () => {
    const link = await getLoungeModuleLinkForLesson(
      'thesis-statements',
      'teacher-1'
    );

    expect(link).toEqual({
      trainingId: 'training-1',
      trainingTitle: 'The Thesis-Driven Essay',
      moduleId: 'module-1',
      moduleTitle: 'Lesson 3: Developing a Thesis Statement',
    });
    // Matched by a stable phrase from the module title, not a hardcoded ID.
    const where = moduleFindFirst.mock.calls[0]?.[0]?.where;
    expect(where?.title?.contains).toBe('Developing a Thesis Statement');
    expect(where?.deletedAt).toBeNull();
  });

  test('topic sentences, evidence, and analysis map to Body Paragraphs', async () => {
    for (const slug of ['topic-sentences', 'evidence', 'analysis']) {
      moduleFindFirst.mockClear();
      await getLoungeModuleLinkForLesson(slug, 'teacher-1');
      const where = moduleFindFirst.mock.calls[0]?.[0]?.where;
      expect(where?.title?.contains).toBe('Body Paragraphs');
    }
  });

  test('a teacher with assigned courses only sees modules from those courses', async () => {
    orgMembershipFindUnique.mockResolvedValue({
      _count: { assignedTeacherTrainings: 2 },
    });

    await getLoungeModuleLinkForLesson('thesis-statements', 'teacher-1');

    const where = moduleFindFirst.mock.calls[0]?.[0]?.where;
    expect(where?.teacherTraining?.assignedTeachers?.some?.id).toBe(
      'teacher-1'
    );
  });

  test('a teacher with no assigned courses is not assignment-filtered', async () => {
    await getLoungeModuleLinkForLesson('thesis-statements', 'teacher-1');

    const where = moduleFindFirst.mock.calls[0]?.[0]?.where;
    expect(where?.teacherTraining?.assignedTeachers).toBeUndefined();
  });

  test('returns null when no matching module exists', async () => {
    moduleFindFirst.mockResolvedValue(null);

    const link = await getLoungeModuleLinkForLesson(
      'thesis-statements',
      'teacher-1'
    );

    expect(link).toBeNull();
  });

  test('returns null when the lookup fails, never throwing', async () => {
    moduleFindFirst.mockRejectedValue(new Error('db down'));

    const link = await getLoungeModuleLinkForLesson(
      'thesis-statements',
      'teacher-1'
    );

    expect(link).toBeNull();
  });
});
