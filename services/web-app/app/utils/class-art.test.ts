import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  CLASS_ART_LIBRARY,
  CLASS_ART_POOL,
  CLASS_ART_POOL_SIZE,
  CLASS_ARTWORK_COUNT,
  buildClassArtKey,
  buildClassArtPoolIndex,
  generateClassArt,
  getArtworkIndexFromPoolIndex,
  getClassArtByIndex,
  getCropIndexFromPoolIndex,
  pickNextClassArtIndexForOrganization,
  pickNextClassArtKeyForOrganization,
  resolveClassArtSelection,
} from './class-art';

describe('generateClassArt', () => {
  test('is deterministic for the same seed', () => {
    const a = generateClassArt('class-abc-123');
    const b = generateClassArt('class-abc-123');
    expect(b).toEqual(a);
  });

  test('different seeds can select different artworks', () => {
    const seeds = [
      'cls-1',
      'cls-2',
      'cls-3',
      'cls-4',
      'cls-5',
      'cls-6',
      'cls-7',
      'cls-8',
      'cls-9',
      'cls-10',
      'cls-11',
      'cls-12',
    ];
    const sources = seeds.map((seed) => generateClassArt(seed).src);
    expect(new Set(sources).size).toBeGreaterThan(1);
  });

  test('always selects a src/credit/position combination from the library', () => {
    const bySrc = new Map(
      CLASS_ART_LIBRARY.map((entry) => [entry.src, entry])
    );
    for (const seed of ['a', 'period-1', 'grade-9', 'zz-top', 'cls-42']) {
      const art = generateClassArt(seed);
      const entry = bySrc.get(art.src);
      expect(entry).toBeDefined();
      expect(art.credit).toBe(entry!.credit);
      expect(entry!.positions).toContain(art.backgroundPosition);
    }
  });

  test('library entries are unique and well-formed', () => {
    const seen = new Set<string>();
    for (const entry of CLASS_ART_LIBRARY) {
      expect(seen.has(entry.src)).toBe(false);
      seen.add(entry.src);
      expect(entry.src.startsWith('/img/class-art/')).toBe(true);
      expect(entry.credit.length).toBeGreaterThan(0);
      expect(entry.positions.length).toBeGreaterThan(0);
    }
  });

  test('every library image is bundled as a static asset', () => {
    const publicDir = join(import.meta.dir, '../../public');

    for (const entry of CLASS_ART_LIBRARY) {
      expect(existsSync(join(publicDir, entry.src))).toBe(true);
    }
  });
});

describe('CLASS_ART_POOL', () => {
  test('flattens every library entry crop into one pool item each', () => {
    const expectedSize = CLASS_ART_LIBRARY.reduce(
      (sum, entry) => sum + entry.positions.length,
      0
    );
    expect(CLASS_ART_POOL_SIZE).toBe(expectedSize);
    expect(CLASS_ART_POOL).toHaveLength(expectedSize);
  });

  test('every pool entry matches a library entry crop', () => {
    const bySrc = new Map(
      CLASS_ART_LIBRARY.map((entry) => [entry.src, entry])
    );
    for (const selection of CLASS_ART_POOL) {
      const entry = bySrc.get(selection.src);
      expect(entry).toBeDefined();
      expect(entry!.positions).toContain(selection.backgroundPosition);
    }
  });
});

describe('getClassArtByIndex', () => {
  test('returns the matching pool entry for in-range indices', () => {
    expect(getClassArtByIndex(0)).toEqual(CLASS_ART_POOL[0]);
    expect(getClassArtByIndex(CLASS_ART_POOL_SIZE - 1)).toEqual(
      CLASS_ART_POOL[CLASS_ART_POOL_SIZE - 1]
    );
  });

  test('wraps out-of-range indices into bounds', () => {
    expect(getClassArtByIndex(CLASS_ART_POOL_SIZE)).toEqual(CLASS_ART_POOL[0]);
    expect(getClassArtByIndex(-1)).toEqual(
      CLASS_ART_POOL[CLASS_ART_POOL_SIZE - 1]
    );
  });
});

describe('class art pool indexing', () => {
  test('maps artwork and crop indices to the flattened pool index', () => {
    expect(buildClassArtPoolIndex(0, 0)).toBe(0);
    expect(buildClassArtPoolIndex(0, 2)).toBe(2);
    expect(buildClassArtPoolIndex(1, 0)).toBe(3);
    expect(getArtworkIndexFromPoolIndex(3)).toBe(1);
    expect(getCropIndexFromPoolIndex(3)).toBe(0);
  });
});

describe('resolveClassArtSelection', () => {
  test('prefers a persisted classArtKey', () => {
    const art = resolveClassArtSelection({
      classArtKey: getClassArtByIndex(0).key,
      legacyClassArtIndex: 99,
      seed: 'class-abc',
    });
    expect(art).toEqual(getClassArtByIndex(0));
  });

  test('falls back to legacy classArtIndex when key is missing', () => {
    const art = resolveClassArtSelection({
      classArtKey: null,
      legacyClassArtIndex: 0,
      seed: 'class-abc',
    });
    expect(art).toEqual(getClassArtByIndex(0));
  });
});

describe('class art keys', () => {
  test('every pool entry has a unique stable key', () => {
    const keys = CLASS_ART_POOL.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(buildClassArtKey('paul-klee-castle-and-sun', 'center 40%')).toBe(
      'paul-klee-castle-and-sun::center-40pct'
    );
  });
});

describe('pickNextClassArtKeyForOrganization', () => {
  test('returns stable keys while preserving crop rotation', () => {
    const assigned = Array.from({ length: CLASS_ARTWORK_COUNT - 1 }, (_, artwork) =>
      getClassArtByIndex(buildClassArtPoolIndex(artwork, 0)).key
    );

    const next = pickNextClassArtKeyForOrganization(assigned, () => 0);

    expect(getCropIndexFromPoolIndex(
      CLASS_ART_POOL.findIndex((entry) => entry.key === next)
    )).toBe(0);
  });
});

describe('pickNextClassArtIndexForOrganization', () => {
  test('uses crop 0 for every artwork before any artwork gets crop 1', () => {
    const assigned = Array.from({ length: CLASS_ARTWORK_COUNT - 1 }, (_, artwork) =>
      buildClassArtPoolIndex(artwork, 0)
    );

    const next = pickNextClassArtIndexForOrganization(assigned, () => 0);

    expect(getCropIndexFromPoolIndex(next)).toBe(0);
    expect(getArtworkIndexFromPoolIndex(next)).toBe(CLASS_ARTWORK_COUNT - 1);
  });

  test('moves to crop 1 only after every artwork has crop 0', () => {
    const assigned = Array.from({ length: CLASS_ARTWORK_COUNT }, (_, artwork) =>
      buildClassArtPoolIndex(artwork, 0)
    );

    const next = pickNextClassArtIndexForOrganization(assigned, () => 0);

    expect(getCropIndexFromPoolIndex(next)).toBe(1);
    expect(getArtworkIndexFromPoolIndex(next)).toBe(0);
  });

  test('falls back to crop 0 once every artwork has every crop', () => {
    const assigned: number[] = [];
    for (let crop = 0; crop < 3; crop++) {
      for (let artwork = 0; artwork < CLASS_ARTWORK_COUNT; artwork++) {
        assigned.push(buildClassArtPoolIndex(artwork, crop));
      }
    }

    const next = pickNextClassArtIndexForOrganization(assigned, () => 0);

    expect(getCropIndexFromPoolIndex(next)).toBe(0);
    expect(getArtworkIndexFromPoolIndex(next)).toBe(0);
  });
});
