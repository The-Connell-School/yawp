import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  submission: {
    findMany: mock(),
  },
  assignmentType: {
    findMany: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { loadPiles } = await import('./released-grades.server');

describe('loadPiles', () => {
  beforeEach(() => {
    prisma.submission.findMany.mockReset();
    prisma.assignmentType.findMany.mockReset();
  });

  test('returns empty array when class has no released submissions', async () => {
    prisma.submission.findMany.mockResolvedValue([]);
    const piles = await loadPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([]);
  });

  test('aggregates submissions per AssignmentType, sorted by mostRecentReleasedAt desc', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 's_1',
        releasedAt: new Date('2026-05-01'),
        document: { assignmentTypeId: 'at_2' },
      },
      {
        id: 's_2',
        releasedAt: new Date('2026-04-29'),
        document: { assignmentTypeId: 'at_2' },
      },
      {
        id: 's_3',
        releasedAt: new Date('2026-04-28'),
        document: { assignmentTypeId: 'at_1' },
      },
    ]);
    prisma.assignmentType.findMany.mockResolvedValue([
      { id: 'at_1', title: 'Persuasive Essay' },
      { id: 'at_2', title: 'Macbeth Essay' },
    ]);
    const piles = await loadPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([
      {
        assignmentTypeId: 'at_2',
        title: 'Macbeth Essay',
        count: 2,
        mostRecentReleasedAt: new Date('2026-05-01'),
      },
      {
        assignmentTypeId: 'at_1',
        title: 'Persuasive Essay',
        count: 1,
        mostRecentReleasedAt: new Date('2026-04-28'),
      },
    ]);
  });

  test('honors date-range filter on releasedAt', async () => {
    prisma.submission.findMany.mockResolvedValue([]);
    await loadPiles({
      classId: 'class_1',
      filters: {
        releasedFrom: new Date('2026-04-01'),
        releasedTo: new Date('2026-04-30'),
      },
    });
    const call = prisma.submission.findMany.mock.calls[0]![0];
    expect(call.where.releasedAt).toEqual({
      not: null,
      gte: new Date('2026-04-01'),
      lte: new Date('2026-04-30'),
    });
  });
});
