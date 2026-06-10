import { describe, expect, test } from 'bun:test';
import {
  CLASS_ART_HEIGHT,
  CLASS_ART_PALETTE,
  CLASS_ART_WIDTH,
  generateClassArt,
  type ClassArtSpec,
} from './class-art';

const paletteColors = new Set<string>(Object.values(CLASS_ART_PALETTE));

function collectColors(spec: ClassArtSpec): string[] {
  const colors: string[] = [spec.background];
  for (const element of spec.elements) {
    if ('fill' in element && element.fill) colors.push(element.fill);
    if ('stroke' in element && element.stroke) colors.push(element.stroke);
  }
  return colors;
}

describe('generateClassArt', () => {
  test('is deterministic for the same seed', () => {
    const a = generateClassArt('class-abc-123');
    const b = generateClassArt('class-abc-123');
    expect(b).toEqual(a);
  });

  test('different seeds produce different art', () => {
    const seeds = ['cls-1', 'cls-2', 'cls-3', 'cls-4', 'cls-5'];
    const specs = seeds.map((seed) => JSON.stringify(generateClassArt(seed)));
    expect(new Set(specs).size).toBe(seeds.length);
  });

  test('only uses Yawp palette colors', () => {
    for (const seed of ['a', 'period-1', 'grade-9', 'zz-top', 'cls-42']) {
      const spec = generateClassArt(seed);
      for (const color of collectColors(spec)) {
        expect(paletteColors.has(color)).toBe(true);
      }
    }
  });

  test('stays sparse and within the viewbox', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const spec = generateClassArt(seed);
      expect(spec.elements.length).toBeGreaterThan(0);
      expect(spec.elements.length).toBeLessThanOrEqual(120);
      for (const element of spec.elements) {
        if (element.kind === 'rect') {
          expect(element.x).toBeGreaterThanOrEqual(0);
          expect(element.y).toBeGreaterThanOrEqual(0);
          expect(element.x + element.width).toBeLessThanOrEqual(
            CLASS_ART_WIDTH
          );
          expect(element.y + element.height).toBeLessThanOrEqual(
            CLASS_ART_HEIGHT
          );
        }
      }
    }
  });

  test('picks a known motif', () => {
    const motifs = new Set([
      'grid-blocks',
      'ruled-lines',
      'glyph-field',
      'contour',
    ]);
    for (const seed of ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']) {
      expect(motifs.has(generateClassArt(seed).motif)).toBe(true);
    }
  });
});
