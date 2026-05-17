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

const {
  loadPiles,
  loadPileContents,
  loadStudentPiles,
  loadStudentPileContents,
} = await import('./released-grades.server');

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

describe('loadPileContents', () => {
  beforeEach(() => {
    prisma.submission.findMany.mockReset();
  });

  test('returns submissions for an AssignmentType in a class, newest released first, paginated', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 's_1',
        releasedAt: new Date('2026-05-01'),
        numericPercentage: 89,
        document: {
          profile: {
            studentProfile: { id: 'sp_1' },
            user: { name: 'Jamie Lopez' },
          },
        },
      },
      {
        id: 's_2',
        releasedAt: new Date('2026-04-28'),
        numericPercentage: 76,
        document: {
          profile: {
            studentProfile: { id: 'sp_2' },
            user: { name: 'Anita Patel' },
          },
        },
      },
    ]);
    const result = await loadPileContents({
      classId: 'class_1',
      assignmentTypeId: 'at_1',
      filters: {},
      take: 50,
      skip: 0,
    });
    expect(result).toEqual([
      {
        submissionId: 's_1',
        studentProfileId: 'sp_1',
        studentName: 'Jamie Lopez',
        grade: 89,
        releasedAt: new Date('2026-05-01'),
      },
      {
        submissionId: 's_2',
        studentProfileId: 'sp_2',
        studentName: 'Anita Patel',
        grade: 76,
        releasedAt: new Date('2026-04-28'),
      },
    ]);
  });

  test('passes assignmentTypeId scope to the query', async () => {
    prisma.submission.findMany.mockResolvedValue([]);
    await loadPileContents({
      classId: 'class_1',
      assignmentTypeId: 'at_1',
      filters: {},
      take: 50,
      skip: 0,
    });
    const call = prisma.submission.findMany.mock.calls[0]![0];
    expect(call.where.document.assignmentTypeId).toBe('at_1');
    expect(call.take).toBe(50);
    expect(call.skip).toBe(0);
  });
});

describe('loadStudentPiles', () => {
  beforeEach(() => {
    prisma.submission.findMany.mockReset();
  });

  test('returns empty array when no students have released submissions', async () => {
    prisma.submission.findMany.mockResolvedValue([]);
    const piles = await loadStudentPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([]);
  });

  test('groups by student, sorted by most-recent release desc, count per student', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 's_1',
        releasedAt: new Date('2026-05-01'),
        document: {
          profile: {
            studentProfile: { id: 'sp_1' },
            user: { name: 'Jamie Lopez' },
          },
        },
      },
      {
        id: 's_2',
        releasedAt: new Date('2026-04-30'),
        document: {
          profile: {
            studentProfile: { id: 'sp_1' },
            user: { name: 'Jamie Lopez' },
          },
        },
      },
      {
        id: 's_3',
        releasedAt: new Date('2026-04-29'),
        document: {
          profile: {
            studentProfile: { id: 'sp_2' },
            user: { name: 'Anita Patel' },
          },
        },
      },
    ]);
    const piles = await loadStudentPiles({ classId: 'class_1', filters: {} });
    expect(piles).toEqual([
      {
        studentProfileId: 'sp_1',
        studentName: 'Jamie Lopez',
        count: 2,
        mostRecentReleasedAt: new Date('2026-05-01'),
      },
      {
        studentProfileId: 'sp_2',
        studentName: 'Anita Patel',
        count: 1,
        mostRecentReleasedAt: new Date('2026-04-29'),
      },
    ]);
  });
});

describe('loadStudentPileContents', () => {
  beforeEach(() => {
    prisma.submission.findMany.mockReset();
  });

  test('returns submissions for a single student, newest released first, with AssignmentType title', async () => {
    prisma.submission.findMany.mockResolvedValue([
      {
        id: 's_1',
        releasedAt: new Date('2026-05-01'),
        numericPercentage: 92,
        document: {
          assignmentTypeId: 'at_1',
          assignmentType: { title: 'Macbeth Essay' },
        },
      },
    ]);
    const rows = await loadStudentPileContents({
      classId: 'class_1',
      studentProfileId: 'sp_1',
      filters: {},
    });
    expect(rows).toEqual([
      {
        submissionId: 's_1',
        assignmentTypeId: 'at_1',
        assignmentTypeTitle: 'Macbeth Essay',
        grade: 92,
        releasedAt: new Date('2026-05-01'),
      },
    ]);
  });
});
