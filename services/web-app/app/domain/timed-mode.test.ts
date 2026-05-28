import { describe, expect, test } from 'bun:test';
import {
  computeTimedState,
  getTimedConfig,
  formatClock,
} from './timed-mode';

const START = 1_000_000_000_000;

describe('getTimedConfig', () => {
  test('synthesis has a 15-min reading phase + 40-min writing', () => {
    const c = getTimedConfig('synthesis');
    expect(c.readingSeconds).toBe(900);
    expect(c.writingSeconds).toBe(2400);
  });

  test('argument has no reading phase', () => {
    expect(getTimedConfig('argument').readingSeconds).toBe(0);
  });

  test('AP Lit types are single-phase 40 min', () => {
    for (const t of ['poetry-analysis', 'prose-fiction-analysis', 'literary-argument'] as const) {
      const c = getTimedConfig(t);
      expect(c.readingSeconds).toBe(0);
      expect(c.writingSeconds).toBe(2400);
    }
  });
});

describe('computeTimedState — synthesis (reading + writing)', () => {
  test('starts in reading phase with editor locked', () => {
    const s = computeTimedState('synthesis', START, START);
    expect(s.phase).toBe('reading');
    expect(s.editorLocked).toBe(true);
    expect(s.totalSeconds).toBe(900 + 2400);
    expect(s.phaseSecondsRemaining).toBe(900);
  });

  test('still reading at 10 minutes in', () => {
    const s = computeTimedState('synthesis', START, START + 10 * 60 * 1000);
    expect(s.phase).toBe('reading');
    expect(s.editorLocked).toBe(true);
    expect(s.phaseSecondsRemaining).toBe(5 * 60);
  });

  test('unlocks into writing phase after 15 minutes', () => {
    const s = computeTimedState('synthesis', START, START + 15 * 60 * 1000);
    expect(s.phase).toBe('writing');
    expect(s.editorLocked).toBe(false);
    expect(s.phaseSecondsRemaining).toBe(2400);
  });

  test('writing phase counts down toward the writing window', () => {
    const s = computeTimedState('synthesis', START, START + 35 * 60 * 1000);
    expect(s.phase).toBe('writing');
    expect(s.phaseSecondsRemaining).toBe(20 * 60);
    expect(s.secondsRemaining).toBe(20 * 60);
  });

  test('is done after total time elapses', () => {
    const s = computeTimedState('synthesis', START, START + 56 * 60 * 1000);
    expect(s.phase).toBe('done');
    expect(s.editorLocked).toBe(false);
    expect(s.secondsRemaining).toBe(0);
  });
});

describe('computeTimedState — argument (single phase)', () => {
  test('starts immediately in writing phase, editor unlocked', () => {
    const s = computeTimedState('argument', START, START);
    expect(s.phase).toBe('writing');
    expect(s.editorLocked).toBe(false);
    expect(s.totalSeconds).toBe(2400);
    expect(s.phaseSecondsRemaining).toBe(2400);
  });

  test('done after 40 minutes', () => {
    const s = computeTimedState('argument', START, START + 41 * 60 * 1000);
    expect(s.phase).toBe('done');
  });
});

describe('formatClock', () => {
  test('formats minutes and zero-padded seconds', () => {
    expect(formatClock(900)).toBe('15:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(5)).toBe('0:05');
  });

  test('clamps negatives to 0:00', () => {
    expect(formatClock(-10)).toBe('0:00');
  });
});
