import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  CLASS_ART_LIBRARY,
  CLASS_ARTWORK_COUNT,
  getClassArtByKey,
  pickNextClassArtKeyForOrganization,
  resolveClassArtSelection,
  resolveDistinctClassArtSelections,
} from './class-art';

const publicDir = join(import.meta.dir, '..', '..', 'public');

function sha256(src: string) {
  return createHash('sha256')
    .update(readFileSync(join(publicDir, src)))
    .digest('hex');
}

// Scranton Prep, 11/23: Alex Placke's Theology III period 3 and period 6
// looked identical. Period 3 held a retired artwork key and fell back by seed
// to The Great Wave; period 6 held hokusai-moon-beneath-fuji, whose file was a
// second copy of The Great Wave.
const PERIOD_3 = {
  id: 'cmw2d573l000001lbylkvlej5',
  classArtKey: 'ohara-koson-cranes::center-10pct',
};
const PERIOD_6 = {
  id: 'cmw2d90bj000301lbuoytczhw',
  classArtKey: 'hokusai-moon-beneath-fuji::center-0pct',
};

describe('class art library has no repeated pictures', () => {
  test('every artwork file is a different file', () => {
    const hashes = CLASS_ART_LIBRARY.map((entry) => sha256(entry.src));
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  test('hokusai-moon-beneath-fuji is no longer the Great Wave copy', () => {
    expect(sha256('/img/class-art/hokusai-moon-beneath-fuji.jpg')).not.toBe(
      'a1e3a9888a845152d91e97412d5875757ee622edfd0fec483b1fba957e3f9c72'
    );
    expect(
      getClassArtByKey('hokusai-moon-beneath-fuji::center-0pct')?.credit
    ).not.toContain('Great Wave');
  });
});

describe('resolveDistinctClassArtSelections', () => {
  test("Alex Placke's two Theology III classes get different artwork", () => {
    const art = resolveDistinctClassArtSelections([PERIOD_3, PERIOD_6]);
    expect(art.get(PERIOD_3.id)!.artworkKey).not.toBe(
      art.get(PERIOD_6.id)!.artworkKey
    );
  });

  test('keeps art that is already distinct and moves only the repeat', () => {
    const classes = [
      { id: 'a', classArtKey: 'hokusai-great-wave::center-0pct' },
      { id: 'b', classArtKey: 'van-gogh-irises::center-0pct' },
      { id: 'c', classArtKey: 'hokusai-great-wave::center-50pct' },
    ];
    const art = resolveDistinctClassArtSelections(classes);
    expect(art.get('a')!.key).toBe('hokusai-great-wave::center-0pct');
    expect(art.get('b')!.key).toBe('van-gogh-irises::center-0pct');
    expect(art.get('c')!.artworkKey).not.toBe('hokusai-great-wave');
    expect(art.get('c')!.artworkKey).not.toBe('van-gogh-irises');
  });

  test('a retired key that falls back onto a sibling moves to unused art', () => {
    const retired = { id: 'retired', classArtKey: 'ohara-koson-cranes::center-10pct' };
    const fallback = resolveClassArtSelection({
      classArtKey: retired.classArtKey,
      seed: retired.id,
    });
    const art = resolveDistinctClassArtSelections([
      { id: 'older', classArtKey: fallback.key },
      retired,
    ]);
    expect(art.get('retired')!.artworkKey).not.toBe(fallback.artworkKey);
  });

  test('is stable and distinct for a full library of classes', () => {
    const classes = Array.from({ length: CLASS_ARTWORK_COUNT }, (_, i) => ({
      id: `cls-${i}`,
      classArtKey: 'hokusai-great-wave::center-0pct',
    }));
    const first = resolveDistinctClassArtSelections(classes);
    const second = resolveDistinctClassArtSelections(classes);
    expect([...first.values()].map((a) => a.key)).toEqual(
      [...second.values()].map((a) => a.key)
    );
    expect(new Set([...first.values()].map((a) => a.artworkKey)).size).toBe(
      CLASS_ARTWORK_COUNT
    );
  });
});

describe('pickNextClassArtKeyForOrganization avoids the teacher\'s art', () => {
  test('never picks an artwork the teacher already shows while others are free', () => {
    const avoid = new Set(['hokusai-great-wave', 'hokusai-moon-beneath-fuji']);
    for (let i = 0; i < 200; i++) {
      const key = pickNextClassArtKeyForOrganization([], () => (i % 100) / 100, avoid);
      expect(avoid.has(getClassArtByKey(key)!.artworkKey)).toBe(false);
    }
  });
});
