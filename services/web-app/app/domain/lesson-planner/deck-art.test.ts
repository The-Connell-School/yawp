import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DECK_ART, deckArt } from './deck-art';

const publicRoot = join(import.meta.dir, '../../../public');

/** Held for rights review — must never appear in the shipped library. */
const HELD_ART_IDS = ['klee-castle-sun', 'mondrian-composition-rby', 'sargent-gassed'];

describe('deck-art: gallery library entries ship with their JPEGs', () => {
  test('every work has unique id, crops, and files under public/', () => {
    const ids = DECK_ART.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => HELD_ART_IDS.includes(id))).toBe(false);

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
