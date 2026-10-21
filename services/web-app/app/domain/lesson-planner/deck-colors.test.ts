import { describe, expect, test } from 'bun:test';
import {
  PAPER,
  contrastRatio,
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
