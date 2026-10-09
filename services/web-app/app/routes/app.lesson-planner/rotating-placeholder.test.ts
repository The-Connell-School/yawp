import { describe, expect, test } from 'bun:test';
import {
  INITIAL_PLACEHOLDER_STATE,
  PLACEHOLDER_EXAMPLES,
  advancePlaceholder,
  placeholderDelay,
  placeholderFor,
  placeholderText,
  shouldRotatePlaceholder,
  type PlaceholderState,
} from './rotating-placeholder';

const EXAMPLES = ['ab', 'cd'] as const;

/** Runs the state machine forward the way the timer would. */
function frames(steps: number, examples: readonly string[] = EXAMPLES) {
  const seen: string[] = [];
  let state = INITIAL_PLACEHOLDER_STATE;
  for (let step = 0; step < steps; step += 1) {
    seen.push(placeholderText(state, examples));
    state = advancePlaceholder(state, examples);
  }
  return seen;
}

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

describe('advancePlaceholder', () => {
  /**
   * The whole point of the change: the sentence arrives a letter at a time, so
   * the box reads as somebody talking rather than a label being swapped.
   */
  test('types the sentence one letter at a time', () => {
    expect(frames(3)).toEqual(['', 'a', 'ab']);
  });

  test('holds the finished sentence before taking it back', () => {
    const held = frames(5);
    expect(held[2]).toBe('ab');
    expect(held[3]).toBe('ab');
    expect(held[4]).toBe('a');
  });

  test('erases a letter at a time and then types the next example', () => {
    expect(frames(9)).toEqual(['', 'a', 'ab', 'ab', 'a', '', '', 'c', 'cd']);
  });

  test('wraps back to the first example instead of running out', () => {
    let state: PlaceholderState = INITIAL_PLACEHOLDER_STATE;
    for (let step = 0; step < 12; step += 1) {
      state = advancePlaceholder(state, EXAMPLES);
    }
    expect(state.index).toBe(0);
    expect(placeholderText(state, EXAMPLES)).toBe('');
  });

  test('never shows more than the example it is typing', () => {
    for (const shown of frames(40)) {
      expect(EXAMPLES.some((example) => example.startsWith(shown))).toBe(true);
    }
  });
});

describe('placeholderDelay', () => {
  /** A finished sentence has to be readable, not glimpsed. */
  test('rests longest on the finished sentence', () => {
    const typing = placeholderDelay({ index: 0, chars: 1, phase: 'typing' });
    const holding = placeholderDelay({ index: 0, chars: 2, phase: 'holding' });
    const erasing = placeholderDelay({ index: 0, chars: 2, phase: 'erasing' });

    expect(holding).toBeGreaterThan(typing);
    expect(typing).toBeGreaterThan(erasing);
  });

  /** Typing at a human pace, not a ticker's. */
  test('types slower than it erases and faster than it reads', () => {
    expect(
      placeholderDelay({ index: 0, chars: 4, phase: 'typing' })
    ).toBeLessThan(200);
  });

  test('takes a beat on the empty box between examples', () => {
    const cleared = placeholderDelay({ index: 0, chars: 0, phase: 'erasing' });
    const mid = placeholderDelay({ index: 0, chars: 3, phase: 'erasing' });

    expect(cleared).toBeGreaterThan(mid);
  });
});

describe('shouldRotatePlaceholder', () => {
  test('rotates for a teacher who has not typed anything', () => {
    expect(
      shouldRotatePlaceholder({ typed: false, reducedMotion: false })
    ).toBe(true);
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
