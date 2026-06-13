import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
};

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { pickClassArtIndexForTeachers } = await import(
  './class-art-assignment.server'
);
const { CLASS_ART_POOL_SIZE } = await import('./class-art');

describe('pickClassArtIndexForTeachers', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
  });

  test('avoids the indices most recently used by the given teachers', async () => {
    const recentIndices = Array.from(
      { length: CLASS_ART_POOL_SIZE - 1 },
      (_, i) => i
    );
    prisma.class.findMany.mockResolvedValue(
      recentIndices.map((classArtIndex) => ({ classArtIndex }))
    );

    const index = await pickClassArtIndexForTeachers(['teacher-1']);

    expect(index).toBe(CLASS_ART_POOL_SIZE - 1);
  });

  test('falls back to the full pool once every index is recent', async () => {
    const recentIndices = Array.from(
      { length: CLASS_ART_POOL_SIZE },
      (_, i) => i
    );
    prisma.class.findMany.mockResolvedValue(
      recentIndices.map((classArtIndex) => ({ classArtIndex }))
    );

    const index = await pickClassArtIndexForTeachers(['teacher-1']);

    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThan(CLASS_ART_POOL_SIZE);
  });

  test('queries classes for all of the given teachers, most recent first', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await pickClassArtIndexForTeachers(['teacher-1', 'teacher-2']);

    expect(prisma.class.findMany).toHaveBeenCalledWith({
      where: {
        teachers: { some: { id: { in: ['teacher-1', 'teacher-2'] } } },
        classArtIndex: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: CLASS_ART_POOL_SIZE - 1,
      select: { classArtIndex: true },
    });
  });
});
