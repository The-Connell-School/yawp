import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DECK_ART,
  RIGHTS_CHECK_DECK_ART_IDS,
  deckArt,
  resolveDeckArt,
  selectableDeckArt,
} from './deck-art';

const publicRoot = join(import.meta.dir, '../../../public');

describe('deck-art: gallery library entries ship with their JPEGs', () => {
  test('every work has unique id, crops, and files under public/', () => {
    const ids = DECK_ART.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => RIGHTS_CHECK_DECK_ART_IDS.includes(id as (typeof RIGHTS_CHECK_DECK_ART_IDS)[number]))).toBe(
      false
    );

    for (const art of DECK_ART) {
      expect(art.colors.length).toBeGreaterThanOrEqual(2);
      expect(art.themes.length).toBeGreaterThanOrEqual(4);
      expect(art.subject.length).toBeGreaterThan(10);
      for (const rel of [art.src, ...Object.values(art.crops)]) {
        const path = join(publicRoot, rel.replace(/^\//, ''));
        expect(existsSync(path)).toBe(true);
      }
    }
  });

  test('clear-rights seed set is present for lesson-deck matching', () => {
    const seeded = [
      'homer-breezing-up',
      'bruegel-childrens-games',
      'hokusai-great-wave',
      'bierstadt-yosemite-valley',
      'degas-dance-class',
      'turner-temeraire',
      'vangogh-bearers-burden',
    ];
    for (const id of seeded) {
      expect(deckArt(id)?.id).toBe(id);
    }
    expect(DECK_ART.length).toBe(seeded.length);
  });
});

describe('resolveDeckArt: only shipped, clear-rights works resolve', () => {
  test('known ids resolve; held, unknown and empty do not', () => {
    expect(resolveDeckArt('turner-temeraire')?.id).toBe('turner-temeraire');
    for (const held of RIGHTS_CHECK_DECK_ART_IDS) {
      expect(resolveDeckArt(held)).toBeNull();
    }
    expect(resolveDeckArt('klee-castle-sun')).toBeNull();
    expect(resolveDeckArt('not-in-library')).toBeNull();
    expect(resolveDeckArt(null)).toBeNull();
  });

  test('selectableDeckArt matches the shipped library', () => {
    expect(selectableDeckArt().map((work) => work.id)).toEqual(DECK_ART.map((work) => work.id));
  });
});
