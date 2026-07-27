import { describe, expect, it } from 'bun:test';
import {
  captionHoldMs,
  easeInOutCubic,
  seededRandom,
  travelDurationMs,
  typingDelays,
} from './timing';

describe('easeInOutCubic', () => {
  it('pins the endpoints', () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('is symmetric around the midpoint', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
    for (const t of [0.1, 0.25, 0.4]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 10);
    }
  });

  it('starts slow and ends slow', () => {
    // First tenth covers less ground than the middle tenth.
    const firstTenth = easeInOutCubic(0.1) - easeInOutCubic(0);
    const middleTenth = easeInOutCubic(0.55) - easeInOutCubic(0.45);
    expect(firstTenth).toBeLessThan(middleTenth);
  });

  it('is monotonically increasing', () => {
    let previous = -Infinity;
    for (let i = 0; i <= 100; i++) {
      const value = easeInOutCubic(i / 100);
      expect(value).toBeGreaterThan(previous);
      previous = value;
    }
  });

  it('clamps inputs outside the unit interval', () => {
    expect(easeInOutCubic(-2)).toBe(0);
    expect(easeInOutCubic(4)).toBe(1);
  });
});

describe('travelDurationMs', () => {
  it('scales with distance', () => {
    const near = travelDurationMs(100);
    const far = travelDurationMs(800);
    expect(far).toBeGreaterThan(near);
  });

  it('never dips below the floor, even for a zero-length move', () => {
    expect(travelDurationMs(0)).toBe(260);
    expect(travelDurationMs(1)).toBeGreaterThanOrEqual(260);
  });

  it('never exceeds the ceiling, even across a huge screen', () => {
    expect(travelDurationMs(100_000)).toBe(900);
  });

  it('honours explicit overrides', () => {
    expect(travelDurationMs(0, { minMs: 50, maxMs: 100 })).toBe(50);
    expect(travelDurationMs(99_999, { minMs: 50, maxMs: 100 })).toBe(100);
    // 600px at 1200px/s = 500ms, comfortably inside the clamp.
    expect(
      travelDurationMs(600, { pxPerSecond: 1200, minMs: 0, maxMs: 10_000 })
    ).toBe(500);
  });

  it('returns whole milliseconds', () => {
    const duration = travelDurationMs(333);
    expect(Number.isInteger(duration)).toBe(true);
  });

  it('treats negative distance as zero rather than going backwards in time', () => {
    expect(travelDurationMs(-500)).toBe(260);
  });
});

describe('captionHoldMs', () => {
  it('holds longer for longer captions', () => {
    const short = captionHoldMs('Open the class');
    const long = captionHoldMs(
      'Teachers assign from a shared prompt library, so every section starts from the same place'
    );
    expect(long).toBeGreaterThan(short);
  });

  it('keeps even a one-word caption on screen long enough to read', () => {
    expect(captionHoldMs('Grading')).toBeGreaterThanOrEqual(1400);
  });

  it('caps runaway captions', () => {
    const wall = captionHoldMs(new Array(300).fill('word').join(' '));
    expect(wall).toBe(6000);
  });

  it('gives an empty caption the minimum hold', () => {
    expect(captionHoldMs('')).toBe(1400);
    expect(captionHoldMs('   ')).toBe(1400);
  });

  it('derives its hold from the configured reading speed', () => {
    // 12 words at 120wpm = 6s of reading, but the ceiling is generous here.
    const twelveWords = new Array(12).fill('word').join(' ');
    expect(
      captionHoldMs(twelveWords, { wordsPerMinute: 120, maxMs: 60_000 })
    ).toBe(6000);
  });

  it('counts words, not whitespace runs', () => {
    expect(captionHoldMs('one  two\n three')).toBe(
      captionHoldMs('one two three')
    );
  });
});

describe('seededRandom', () => {
  it('is deterministic for a given seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const drawsA = [a(), a(), a(), a()];
    const drawsB = [b(), b(), b(), b()];
    expect(drawsA).toEqual(drawsB);
  });

  it('produces different streams for different seeds', () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('stays inside [0, 1)', () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('typingDelays', () => {
  it('returns one delay per character', () => {
    expect(typingDelays('hello').length).toBe(5);
    expect(typingDelays('').length).toBe(0);
  });

  it('is deterministic for a given seed', () => {
    expect(typingDelays('the quick brown fox', { seed: 9 })).toEqual(
      typingDelays('the quick brown fox', { seed: 9 })
    );
  });

  it('varies keystroke to keystroke so typing does not look robotic', () => {
    const delays = typingDelays('abcdefghijklmnop', { seed: 3 });
    expect(new Set(delays).size).toBeGreaterThan(1);
  });

  it('keeps every delay positive', () => {
    for (const delay of typingDelays('a sentence with spaces', { seed: 5 })) {
      expect(delay).toBeGreaterThan(0);
    }
  });

  it('pauses longer after sentence-ending punctuation', () => {
    // Index 0 is 'a', index 1 is '.', index 2 is ' ' — the delay *after* the
    // period is the one that should stretch.
    const delays = typingDelays('a. b', { seed: 1, jitter: 0 });
    expect(delays[2]).toBeGreaterThan(delays[0]!);
  });

  it('collapses to a flat cadence when jitter is disabled', () => {
    const delays = typingDelays('abcd', { seed: 1, jitter: 0, baseMs: 40 });
    expect(delays).toEqual([40, 40, 40, 40]);
  });

  it('scales with the configured base speed', () => {
    const slow = typingDelays('abcdefgh', { seed: 2, baseMs: 90, jitter: 0 });
    const fast = typingDelays('abcdefgh', { seed: 2, baseMs: 20, jitter: 0 });
    const total = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0);
    expect(total(slow)).toBeGreaterThan(total(fast));
  });

  it('returns whole milliseconds', () => {
    for (const delay of typingDelays('jitter check', { seed: 11 })) {
      expect(Number.isInteger(delay)).toBe(true);
    }
  });
});
