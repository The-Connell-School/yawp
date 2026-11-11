import { describe, expect, test } from 'bun:test';
import {
  ACTIVE_IDLE_MS,
  activeTick,
  clampPing,
  estimateActiveSeconds,
  formatPlanningTime,
  MAX_PING_SECONDS,
  planningSeconds,
  type ActiveClock,
} from './active-time';

const T0 = Date.UTC(2026, 10, 3, 9, 0, 0);
const min = (n: number) => n * 60_000;

describe('activeTick: a second counts only while the teacher is working', () => {
  const start: ActiveClock = { pending: 0, lastInput: T0 };

  test('counts a second on a visible, focused page with recent input', () => {
    expect(activeTick(start, { now: T0 + 1000, visible: true, focused: true }).pending).toBe(1);
  });

  test('a hidden tab, or another window in front, does not count', () => {
    expect(activeTick(start, { now: T0 + 1000, visible: false, focused: true }).pending).toBe(0);
    expect(activeTick(start, { now: T0 + 1000, visible: true, focused: false }).pending).toBe(0);
  });

  test('a page left open with nobody at it stops counting after the idle window', () => {
    expect(activeTick(start, { now: T0 + ACTIVE_IDLE_MS - 1000, visible: true, focused: true }).pending).toBe(1);
    expect(activeTick(start, { now: T0 + ACTIVE_IDLE_MS + 1000, visible: true, focused: true }).pending).toBe(0);
  });

  test('waiting on the planner’s reply counts, however long it takes', () => {
    expect(
      activeTick(start, { now: T0 + ACTIVE_IDLE_MS * 3, visible: true, focused: true, waiting: true }).pending
    ).toBe(1);
  });
});

describe('clampPing: the server never credits more time than has passed', () => {
  test('a ping is capped, and never more than the time since the last one', () => {
    expect(clampPing(30, null, T0)).toBe(30);
    expect(clampPing(10_000, null, T0)).toBe(MAX_PING_SECONDS);
    expect(clampPing(30, new Date(T0 - 10_000), T0)).toBe(15);
    expect(clampPing(-4, null, T0)).toBe(0);
    expect(clampPing(Number.NaN, null, T0)).toBe(0);
  });
});

describe('estimateActiveSeconds: lessons from before the clock', () => {
  test('sums the gaps between what the teacher did, each gap capped at a working stretch', () => {
    const events = [new Date(T0), new Date(T0 + min(2)), new Date(T0 + min(4))];
    expect(estimateActiveSeconds(events)).toBe(4 * 60);
  });

  test('a break is not planning: a gap counts only up to the cap', () => {
    const events = [new Date(T0), new Date(T0 + min(2)), new Date(T0 + 3 * 60 * min(60)), new Date(T0 + 3 * 60 * min(60) + min(1))];
    expect(estimateActiveSeconds(events)).toBe(2 * 60 + 5 * 60 + 60);
  });

  test('order does not matter, and one event is a minute', () => {
    expect(estimateActiveSeconds([new Date(T0 + min(3)), new Date(T0)])).toBe(3 * 60);
    expect(estimateActiveSeconds([new Date(T0)])).toBe(60);
    expect(estimateActiveSeconds([])).toBe(0);
  });
});

describe('planningSeconds', () => {
  const events = [new Date(T0), new Date(T0 + min(2)), new Date(T0 + min(30)), new Date(T0 + min(31))];

  test('measured from the start: the clock alone', () => {
    expect(planningSeconds({ activeSeconds: 900, activeSince: new Date(T0 - 5000), events })).toBe(900);
  });

  test('measured from partway through: the estimate before the clock started, then the clock', () => {
    // Before T0+30min: 0→2 (2 min) and 2→30 (capped at 5): 7 min estimated.
    expect(planningSeconds({ activeSeconds: 300, activeSince: new Date(T0 + min(30)), events })).toBe(7 * 60 + 300);
  });

  test('never measured: the estimate', () => {
    expect(planningSeconds({ activeSeconds: 0, activeSince: null, events })).toBe(8 * 60);
  });
});

describe('formatPlanningTime', () => {
  test('minutes, then hours and minutes', () => {
    expect(formatPlanningTime(20)).toBe('1 min');
    expect(formatPlanningTime(25 * 60)).toBe('25 min');
    expect(formatPlanningTime(60 * 60)).toBe('1 hr');
    expect(formatPlanningTime(95 * 60)).toBe('1 hr 35 min');
  });
});
