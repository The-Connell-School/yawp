import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
};

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { pickClassArtIndexForOrganization } = await import(
  './class-art-assignment.server'
);
const {
  CLASS_ARTWORK_COUNT,
  buildClassArtPoolIndex,
  getArtworkIndexFromPoolIndex,
  getCropIndexFromPoolIndex,
} = await import('./class-art');

describe('pickClassArtIndexForOrganization', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
  });

  test('assigns the last unused artwork at crop 0 for the organization', async () => {
    prisma.class.findMany.mockResolvedValue(
      Array.from({ length: CLASS_ARTWORK_COUNT - 1 }, (_, artwork) => ({
        classArtIndex: buildClassArtPoolIndex(artwork, 0),
      }))
    );

    const index = await pickClassArtIndexForOrganization('org-1', () => 0);

    expect(getCropIndexFromPoolIndex(index)).toBe(0);
    expect(getArtworkIndexFromPoolIndex(index)).toBe(CLASS_ARTWORK_COUNT - 1);
  });

  test('starts crop 1 after every artwork has crop 0 in the org', async () => {
    prisma.class.findMany.mockResolvedValue(
      Array.from({ length: CLASS_ARTWORK_COUNT }, (_, artwork) => ({
        classArtIndex: buildClassArtPoolIndex(artwork, 0),
      }))
    );

    const index = await pickClassArtIndexForOrganization('org-1', () => 0);

    expect(getCropIndexFromPoolIndex(index)).toBe(1);
    expect(getArtworkIndexFromPoolIndex(index)).toBe(0);
  });

  test('queries all non-archived classes in the organization', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await pickClassArtIndexForOrganization('org-1');

    expect(prisma.class.findMany).toHaveBeenCalledWith({
      where: {
        school: { organizationId: 'org-1' },
        classArtIndex: { not: null },
        isArchived: false,
      },
      select: { classArtIndex: true },
    });
  });
});
