import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = { document: { findMany: mock(), count: mock() } };
mock.module('~/utils/db.server', () => ({ prisma }));

const { getTeacherClassCardStats, getTeacherClassCardStatsByClassIds } =
  await import('./teacher-class-card-stats.server');

const emptyStats = {
  ungradedCount: 0,
  gradedUnreleasedCount: 0,
  documentCount: 0,
};

describe('teacher class card statistics', () => {
  beforeEach(() => {
    prisma.document.findMany.mockReset();
    prisma.document.count.mockReset();
    prisma.document.findMany.mockResolvedValue([]);
  });

  test('keeps the single-class API and counts drafts without recounting documents', async () => {
    prisma.document.findMany.mockResolvedValue([
      { classAssignment: { classId: 'a' }, submissions: [] },
      { classAssignment: { classId: 'a' }, submissions: [{}] },
      { classAssignment: { classId: 'a' }, submissions: [{ score: 'A' }] },
      {
        classAssignment: { classId: 'a' },
        submissions: [{ score: 'B', releasedAt: new Date() }],
      },
      {
        classAssignment: { classId: 'a' },
        submissions: [{ releasedAt: new Date() }],
      },
    ]);

    expect(await getTeacherClassCardStats('a')).toEqual({
      ungradedCount: 1,
      gradedUnreleasedCount: 1,
      documentCount: 5,
    });
    expect(prisma.document.count).not.toHaveBeenCalled();
  });

  test('loads many classes in one read and keeps their counts separate', async () => {
    prisma.document.findMany.mockResolvedValue([
      { classAssignment: { classId: 'b' }, submissions: [{}] },
      { classAssignment: { classId: 'a' }, submissions: [{ score: 'A' }] },
      { classAssignment: { classId: 'a' }, submissions: [] },
    ]);

    const stats = await getTeacherClassCardStatsByClassIds(['a', 'b', 'empty', 'a']);
    expect([...stats.keys()]).toEqual(['a', 'b', 'empty']);
    expect(stats.get('a')).toEqual({ ...emptyStats, gradedUnreleasedCount: 1, documentCount: 2 });
    expect(stats.get('b')).toEqual({ ...emptyStats, ungradedCount: 1, documentCount: 1 });
    expect(stats.get('empty')).toEqual(emptyStats);
    expect(prisma.document.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.document.findMany.mock.calls[0][0].where).toEqual({
      deletedAt: null,
      classAssignment: { classId: { in: ['a', 'b', 'empty'] } },
    });
    expect(prisma.document.count).not.toHaveBeenCalled();
  });

  test('does not query the database for an empty class list', async () => {
    expect(await getTeacherClassCardStatsByClassIds([])).toEqual(new Map());
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });

  test('returns independent zero counts for classes with no documents', async () => {
    const stats = await getTeacherClassCardStatsByClassIds(['a', 'b']);
    expect(stats.get('a')).toEqual(emptyStats);
    expect(stats.get('b')).toEqual(emptyStats);
    expect(stats.get('a')).not.toBe(stats.get('b'));
    expect(await getTeacherClassCardStats('missing')).toEqual(emptyStats);
  });

  test('preserves every historical grading signal, including a zero percent grade', async () => {
    const signals = [
      { score: '0' }, { feedback: 'Feedback' }, { overallComment: 'Comment' },
      { letterGrade: 'F' }, { numericPercentage: 0 }, { rubricScores: { one: 0 } },
      { gradedAt: new Date() },
    ];
    prisma.document.findMany.mockResolvedValue([
      ...signals.map((signal) => ({ classAssignment: { classId: 'a' }, submissions: [signal] })),
      { classAssignment: { classId: 'a' }, submissions: [{ rubricScores: {} }] },
      { classAssignment: { classId: 'a' }, submissions: [{ rubricScores: 'ungraded' }] },
    ]);
    expect((await getTeacherClassCardStatsByClassIds(['a'])).get('a')).toEqual({
      ungradedCount: 2,
      gradedUnreleasedCount: signals.length,
      documentCount: signals.length + 2,
    });
  });

  test('only requests the latest submission and never loads essay content', async () => {
    await getTeacherClassCardStatsByClassIds(['a']);
    const query = prisma.document.findMany.mock.calls[0][0];
    expect(query.select).not.toHaveProperty('content');
    expect(query.select.submissions.orderBy).toEqual({ submittedAt: 'desc' });
    expect(query.select.submissions.take).toBe(1);
    expect(query.select.submissions.select).toEqual({
      score: true, feedback: true, rubricScores: true, overallComment: true,
      numericPercentage: true, letterGrade: true, releasedAt: true, gradedAt: true,
    });
  });

  test('propagates database errors instead of showing incorrect empty counts', async () => {
    prisma.document.findMany.mockRejectedValue(new Error('database unavailable'));
    await expect(getTeacherClassCardStatsByClassIds(['a'])).rejects.toThrow('database unavailable');
  });
});
