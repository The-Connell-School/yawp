import { describe, expect, test } from 'bun:test';
import {
  PLACEHOLDER_EXAMPLES,
  placeholderFor,
  shouldRotatePlaceholder,
} from './rotating-placeholder';

describe('placeholderFor', () => {
  test('walks the examples in order', () => {
    expect(placeholderFor(0)).toBe(PLACEHOLDER_EXAMPLES[0]);
    expect(placeholderFor(1)).toBe(PLACEHOLDER_EXAMPLES[1]);
  });

  test('wraps around instead of running out', () => {
    expect(placeholderFor(PLACEHOLDER_EXAMPLES.length)).toBe(
      PLACEHOLDER_EXAMPLES[0]
    );
    expect(placeholderFor(PLACEHOLDER_EXAMPLES.length * 3 + 2)).toBe(
      PLACEHOLDER_EXAMPLES[2]
    );
  });

  /**
   * The examples are the only teaching the empty box does, so each one has to
   * read like something a teacher would actually type: a class, a constraint,
   * and what the room is like.
   */
  test('every example is a sentence a teacher could have written', () => {
    for (const example of PLACEHOLDER_EXAMPLES) {
      expect(example.length).toBeGreaterThan(30);
      expect(example.length).toBeLessThan(120);
      expect(example.startsWith('e.g. ')).toBe(false);
    }
  });
});

describe('shouldRotatePlaceholder', () => {
  test('rotates for a teacher who has not typed anything', () => {
    expect(shouldRotatePlaceholder({ typed: false, reducedMotion: false })).toBe(
      true
    );
  });

  /**
   * Text moving under the cursor while someone is composing is the worst case:
   * it reads as the box editing itself.
   */
  test('stops the moment the teacher starts typing', () => {
    expect(shouldRotatePlaceholder({ typed: true, reducedMotion: false })).toBe(
      false
    );
  });

  test('holds still when the teacher has asked for less motion', () => {
    expect(shouldRotatePlaceholder({ typed: false, reducedMotion: true })).toBe(
      false
    );
  });
});
