import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  class: { findMany: mock() },
};

mock.module('~/utils/db.server.js', () => ({ prisma }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { pickClassArtKeyForOrganization } = await import(
  './class-art-assignment.server'
);
const {
  CLASS_ART_POOL,
  CLASS_ARTWORK_COUNT,
  buildClassArtPoolIndex,
  getArtworkIndexFromPoolIndex,
  getClassArtByIndex,
  getCropIndexFromPoolIndex,
} = await import('./class-art');

function poolIndexForKey(key: string) {
  return CLASS_ART_POOL.findIndex((entry) => entry.key === key);
}

describe('pickClassArtKeyForOrganization', () => {
  beforeEach(() => {
    prisma.class.findMany.mockReset();
  });

  test('assigns the last unused artwork at crop 0 for the organization', async () => {
    prisma.class.findMany.mockResolvedValue(
      Array.from({ length: CLASS_ARTWORK_COUNT - 1 }, (_, artwork) => ({
        classArtKey: getClassArtByIndex(buildClassArtPoolIndex(artwork, 0)).key,
        classArtIndex: null,
      }))
    );

    const key = await pickClassArtKeyForOrganization('org-1', () => 0);

    expect(key).toBe(
      getClassArtByIndex(buildClassArtPoolIndex(CLASS_ARTWORK_COUNT - 1, 0)).key
    );
  });

  test('starts crop 1 after every artwork has crop 0 in the org', async () => {
    prisma.class.findMany.mockResolvedValue(
      Array.from({ length: CLASS_ARTWORK_COUNT }, (_, artwork) => ({
        classArtKey: getClassArtByIndex(buildClassArtPoolIndex(artwork, 0)).key,
        classArtIndex: null,
      }))
    );

    const key = await pickClassArtKeyForOrganization('org-1', () => 0);

    expect(getCropIndexFromPoolIndex(poolIndexForKey(key))).toBe(1);
    expect(getArtworkIndexFromPoolIndex(poolIndexForKey(key))).toBe(0);
  });

  test('queries classes with either classArtKey or legacy classArtIndex', async () => {
    prisma.class.findMany.mockResolvedValue([]);

    await pickClassArtKeyForOrganization('org-1');

    expect(prisma.class.findMany).toHaveBeenCalledWith({
      where: {
        school: { organizationId: 'org-1' },
        isArchived: false,
        OR: [{ classArtKey: { not: null } }, { classArtIndex: { not: null } }],
      },
      select: { classArtKey: true, classArtIndex: true },
    });
  });

  test('maps legacy classArtIndex rows when picking the next key', async () => {
    prisma.class.findMany.mockResolvedValue(
      Array.from({ length: CLASS_ARTWORK_COUNT - 1 }, (_, artwork) => ({
        classArtKey: null,
        classArtIndex: buildClassArtPoolIndex(artwork, 0),
      }))
    );

    const key = await pickClassArtKeyForOrganization('org-1', () => 0);

    expect(getArtworkIndexFromPoolIndex(poolIndexForKey(key))).toBe(
      CLASS_ARTWORK_COUNT - 1
    );
  });
});
