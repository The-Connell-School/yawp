import { existsSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import {
  CLASS_ART_LIBRARY,
  CLASS_ART_POOL,
  CLASS_ART_POOL_SIZE,
  generateClassArt,
  getClassArtByIndex,
  pickNextClassArtIndex,
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
    for (const entry of CLASS_ART_LIBRARY) {
      expect(existsSync(`public${entry.src}`)).toBe(true);
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

describe('pickNextClassArtIndex', () => {
  test('avoids every recently-used index when an unused one remains', () => {
    const recent = Array.from({ length: CLASS_ART_POOL_SIZE - 1 }, (_, i) => i);
    expect(pickNextClassArtIndex(recent, () => 0)).toBe(CLASS_ART_POOL_SIZE - 1);
  });

  test('falls back to the full pool once every index is recent', () => {
    const recent = Array.from({ length: CLASS_ART_POOL_SIZE }, (_, i) => i);
    expect(pickNextClassArtIndex(recent, () => 0)).toBe(0);
  });

  test('uses the provided random source to choose among the remaining indices', () => {
    const recent = [0, 1, 2];
    expect(pickNextClassArtIndex(recent, () => 0.999999)).toBe(
      CLASS_ART_POOL_SIZE - 1
    );
  });
});
