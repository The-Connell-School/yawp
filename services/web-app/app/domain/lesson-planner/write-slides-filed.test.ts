/**
 * The writing on the slides is the writing in the stack (round 3, Nov 22).
 * The fixture is round 3's Macbeth reply.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { readSlideDeck } from './slide-deck';
import { withWriteSlidesAsFiled } from './write-slides-filed';

const MACBETH = readFileSync(join(import.meta.dir, 'fixtures', 'reply-macbeth-round-3.md'), 'utf8');

describe('withWriteSlidesAsFiled', () => {
  test('a class-starter slide that shows another option shows the one filed', () => {
    const other = MACBETH.replace(
      '"body": "If no one ever found out, would you still be the same person you are now?"',
      '"body": "I am the captain of my destiny. Agree or disagree and explain your rationale."'
    );
    expect(other).not.toBe(MACBETH);
    const out = withWriteSlidesAsFiled(other);
    const deck = readSlideDeck(out);
    if (deck.kind !== 'deck') throw new Error('deck lost');
    const starter = deck.deck.slides.find((slide) => slide.layout === 'write' && /starter/i.test(slide.routine ?? ''))!;
    expect(starter.body).toBe('If no one ever found out, would you still be the same person you are now?');
  });

  test('a reply whose slides already match is returned as it was', () => {
    expect(withWriteSlidesAsFiled(MACBETH)).toBe(MACBETH);
  });

  test('a reply without a deck is returned as it was', () => {
    expect(withWriteSlidesAsFiled('## Plan\n\nNo deck here.')).toBe('## Plan\n\nNo deck here.');
  });
});
