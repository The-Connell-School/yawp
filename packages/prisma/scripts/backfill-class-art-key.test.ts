import { describe, expect, mock, test } from 'bun:test';
import {
  CLASS_ARTWORK_COUNT,
  LEGACY_CLASS_ART_KEY_BY_POOL_INDEX,
  buildClassArtKey,
  buildClassArtPoolIndex,
  classArtKeyFromLegacyPoolIndex,
  getClassArtByIndex,
  getClassArtByKey,
} from '../../../services/web-app/app/utils/class-art.ts';
import {
  assignedKeyForClass,
  backfillClassArtKeys,
  buildAssignedClassArtKeysByOrg,
} from './backfill-class-art-key';

function classRow({
  id,
  classArtIndex = null,
  classArtKey = null,
  organizationId = 'org-1',
}: {
  id: string;
  classArtIndex?: number | null;
  classArtKey?: string | null;
  organizationId?: string;
}) {
  return {
    id,
    classArtIndex,
    classArtKey,
    school: { organizationId },
  };
}

describe('class art legacy pool keys', () => {
  test('maps every shipped classArtIndex to a valid stable key', () => {
    for (let index = 0; index < LEGACY_CLASS_ART_KEY_BY_POOL_INDEX.length; index++) {
      const key = classArtKeyFromLegacyPoolIndex(index);
      expect(key).toBe(LEGACY_CLASS_ART_KEY_BY_POOL_INDEX[index]);
      expect(getClassArtByKey(key!)).toEqual(getClassArtByIndex(index));
    }
  });

  test('uses artwork slug and slugified crop position in the key', () => {
    expect(
      buildClassArtKey('paul-klee-castle-and-sun', 'center 40%')
    ).toBe('paul-klee-castle-and-sun::center-40pct');
  });
});

describe('class art key backfill', () => {
  test('prefers existing stable keys and maps legacy indices to stable keys', () => {
    const existingKey = getClassArtByIndex(5).key;

    expect(
      assignedKeyForClass({
        classId: 'class-with-key',
        classArtKey: existingKey,
        classArtIndex: 0,
      })
    ).toBe(existingKey);
    expect(
      assignedKeyForClass({
        classId: 'class-with-index',
        classArtKey: null,
        classArtIndex: 0,
      })
    ).toBe(getClassArtByIndex(0).key);
  });

  test('seeds org rotation from both current keys and legacy indices', () => {
    const assignedByOrg = buildAssignedClassArtKeysByOrg([
      classRow({ id: 'keyed', classArtKey: getClassArtByIndex(2).key }),
      classRow({ id: 'legacy', classArtIndex: 3 }),
    ]);

    expect(assignedByOrg.get('org-1')).toEqual([
      getClassArtByIndex(2).key,
      getClassArtByIndex(3).key,
    ]);
  });

  test('fills only missing keys and accounts for later legacy-index rows before rotating', async () => {
    const existingLegacyRow = classRow({
      id: 'legacy-row-created-later',
      classArtIndex: buildClassArtPoolIndex(0, 0),
    });
    const rowWithoutLegacyIndex = classRow({ id: 'missing-index-row' });
    const rowWithLegacyIndex = classRow({
      id: 'legacy-row-needing-key',
      classArtIndex: buildClassArtPoolIndex(0, 0),
    });
    const updates: Array<{ where: { id: string }; data: { classArtKey: string } }> = [];
    const prisma = {
      class: {
        findMany: mock((args: unknown) => {
          const where = (args as { where?: unknown }).where;
          if (
            JSON.stringify(where).includes('classArtIndex') &&
            !JSON.stringify(where).includes('"classArtKey":null')
          ) {
            return Promise.resolve([existingLegacyRow]);
          }
          return Promise.resolve([rowWithoutLegacyIndex, rowWithLegacyIndex]);
        }),
        update: mock((args: { where: { id: string }; data: { classArtKey: string } }) => {
          updates.push(args);
          return Promise.resolve(args);
        }),
        count: mock(() => Promise.resolve(0)),
      },
    };

    const result = await backfillClassArtKeys(prisma, () => 0);

    expect(result).toEqual({ updated: 2, remaining: 0 });
    expect(updates).toHaveLength(2);
    expect(updates[0]).toEqual({
      where: { id: 'missing-index-row' },
      data: { classArtKey: getClassArtByIndex(buildClassArtPoolIndex(1, 0)).key },
    });
    expect(updates[1]).toEqual({
      where: { id: 'legacy-row-needing-key' },
      data: { classArtKey: getClassArtByIndex(buildClassArtPoolIndex(0, 0)).key },
    });
    expect(CLASS_ARTWORK_COUNT).toBeGreaterThan(1);
  });
});
