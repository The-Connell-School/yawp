import { describe, expect, test } from 'bun:test';
import {
  PAPER,
  contrastRatio,
  paletteFromPixels,
  deckColors,
  readableOnPaper,
  slideColor,
  splitColorMarks,
} from './deck-colors';

describe('contrast and darkening (Deck spec v3: 4.5:1 on paper)', () => {
  test('ink on paper is the spec’s 15.1:1, stone 4.7:1', () => {
    expect(contrastRatio('#1B1B1B', PAPER)).toBeCloseTo(15.1, 0);
    expect(contrastRatio('#6F6A63', PAPER)).toBeCloseTo(4.7, 0);
  });

  test('a color already dark enough is kept as it is', () => {
    expect(readableOnPaper('#9C4A22')).toBe('#9C4A22');
  });

  test('a light color is darkened until it reads from the back of the room', () => {
    const darkened = readableOnPaper('#E8906F');
    expect(darkened).not.toBe('#E8906F');
    expect(contrastRatio(darkened, PAPER)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('deckColors', () => {
  test('the deck’s own colors first, at most three, all readable', () => {
    const colors = deckColors({ colors: ['#9C4A22', '#3F5A73', '#7D6118', '#123456'] }, null);
    expect(colors).toEqual(['#9C4A22', '#3F5A73', '#7D6118']);
  });

  test('then the painting’s colors, then the legacy accent', () => {
    expect(deckColors({}, { colors: ['#2F5873'] })).toEqual(['#2F5873']);
    expect(deckColors({ accent: 'indigo' }, null)).toEqual(['#2F5873']);
    expect(deckColors({}, null)).toHaveLength(1);
  });

  test('a bad hex is dropped, not trusted', () => {
    expect(deckColors({ colors: ['red', '#3F5A73'] }, null)).toEqual(['#3F5A73']);
  });
});

describe('slideColor: mode words and accents rotate through the deck colors', () => {
  const colors = ['#9C4A22', '#3F5A73', '#7D6118'];

  test('the slide’s own pick wins', () => {
    expect(slideColor(colors, 4, 2)).toBe('#3F5A73');
  });

  test('otherwise it rotates by slide', () => {
    expect(slideColor(colors, 0)).toBe('#9C4A22');
    expect(slideColor(colors, 1)).toBe('#3F5A73');
    expect(slideColor(colors, 3)).toBe('#9C4A22');
  });
});

describe('splitColorMarks: color can carry meaning', () => {
  const colors = ['#9C4A22', '#3F5A73', '#7D6118'];

  test('numbered marks take the deck’s colors, hex marks their own', () => {
    expect(splitColorMarks('A ~~1|claim~~, a ~~2|reason~~ and ~~#2E6B3A|evidence~~.', colors)).toEqual([
      { text: 'A ' },
      { text: 'claim', color: '#9C4A22' },
      { text: ', a ' },
      { text: 'reason', color: '#3F5A73' },
      { text: ' and ' },
      { text: 'evidence', color: '#2E6B3A' },
      { text: '.' },
    ]);
  });

  test('plain text is one run; an unknown color number falls back to the primary', () => {
    expect(splitColorMarks('Plain.', colors)).toEqual([{ text: 'Plain.' }]);
    expect(splitColorMarks('~~9|x~~', colors)).toEqual([{ text: 'x', color: '#9C4A22' }]);
  });
});

describe('paletteFromPixels: two or three colors sampled from a painting', () => {
  const fill = (rgb: [number, number, number], count: number) => Array.from({ length: count }, () => rgb);

  test('the strongest distinct colors, each readable on paper, grays left out', () => {
    const pixels = [
      ...fill([200, 90, 40], 400), // rust, the most
      ...fill([60, 100, 160], 250), // a blue
      ...fill([205, 95, 45], 100), // the same rust again
      ...fill([128, 128, 128], 900), // gray sky: never a deck color
      ...fill([200, 170, 40], 150), // ochre
    ];
    const palette = paletteFromPixels(pixels);
    expect(palette).toHaveLength(3);
    for (const hex of palette) expect(contrastRatio(hex, PAPER)).toBeGreaterThanOrEqual(4.5);
    // Rust first (the most of it), then the ochre and the blue: never twice the same hue.
    const hue = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255) as [number, number, number];
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      const h = max === r ? ((g - b) / d) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
      const degrees = (h + 360) % 360;
      return degrees < 35 ? 'red' : degrees < 70 ? 'yellow' : degrees > 180 && degrees < 260 ? 'blue' : 'other';
    };
    expect(palette.map(hue)[0]).toBe('red');
    expect(new Set(palette.map(hue))).toEqual(new Set(['red', 'blue', 'yellow']));
  });

  test('a nearly gray painting still gets one color, from its strongest tint', () => {
    expect(paletteFromPixels([...fill([120, 120, 125], 500), ...fill([140, 110, 90], 50)])).toHaveLength(1);
  });
});
