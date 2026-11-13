import { describe, expect, mock, test } from 'bun:test';

const classAssignmentFindMany = mock(async () => [] as { id: string; assignmentId: string }[]);
const classAssignmentDeleteMany = mock(async () => ({ count: 0 }));
const classAssignmentCount = mock(async () => 0);
const assignmentDelete = mock(async () => ({}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    classAssignment: {
      findMany: classAssignmentFindMany,
      deleteMany: classAssignmentDeleteMany,
      count: classAssignmentCount,
    },
    assignment: { delete: assignmentDelete },
  },
}));

const {
  LOCKED_PREVIEW_SAMPLE_TITLES,
  removeLockedPreviewSampleAssignments,
} = await import('./locked-preview-class-seed.server');

describe('removeLockedPreviewSampleAssignments', () => {
  test('exports the three legacy preview titles', () => {
    expect(LOCKED_PREVIEW_SAMPLE_TITLES).toEqual([
      'Opening Lines',
      'Community Gardens — Prewriting',
      'Community Gardens — Thesis',
    ]);
  });

  test('removes class links and deletes orphan preview assignments', async () => {
    classAssignmentFindMany.mockResolvedValueOnce([
      { id: 'ca-1', assignmentId: 'a-1' },
      { id: 'ca-2', assignmentId: 'a-2' },
    ]);
    classAssignmentCount.mockResolvedValueOnce(0);
    classAssignmentCount.mockResolvedValueOnce(1);

    await removeLockedPreviewSampleAssignments('class-1');

    expect(classAssignmentDeleteMany).toHaveBeenCalledWith({
      where: { classId: 'class-1', assignmentId: { in: ['a-1', 'a-2'] } },
    });
    expect(assignmentDelete).toHaveBeenCalledTimes(1);
    expect(assignmentDelete).toHaveBeenCalledWith({ where: { id: 'a-1' } });
  });
});
