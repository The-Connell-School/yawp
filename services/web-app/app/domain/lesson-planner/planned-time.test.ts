import { describe, expect, test } from 'bun:test';
import { IDLE_GAP_MINUTES, plannedLabel, plannedMinutes } from './planned-time';

const at = (iso: string) => new Date(iso);
function minutesAfter(start: string, ...offsets: number[]) {
  return offsets.map((minutes) => new Date(Date.parse(start) + minutes * 60_000));
}

describe("plannedMinutes: real working time (Brian's round 5, item 12)", () => {
  test('one sitting counts every minute of it', () => {
    expect(plannedMinutes(minutesAfter('2026-10-25T14:00:00Z', 0, 2, 5, 9, 12, 16, 20))).toBe(20);
  });

  test('set one day, reopened the next for a minute: a minute or two more, not a day', () => {
    const dayOne = minutesAfter('2026-10-25T14:00:00Z', 0, 3, 7, 11, 15, 20);
    const dayTwo = minutesAfter('2026-10-26T10:00:00Z', 0, 1);
    const total = plannedMinutes([...dayOne, ...dayTwo]);
    expect(total).toBeGreaterThanOrEqual(21);
    expect(total).toBeLessThanOrEqual(22);
  });

  test('a tab left open and idle does not count', () => {
    const times = [...minutesAfter('2026-10-25T14:00:00Z', 0, 4, 8), ...minutesAfter('2026-10-25T16:00:00Z', 0, 3)];
    expect(plannedMinutes(times)).toBe(8 + 1 + 3);
  });

  test(`a gap of ${IDLE_GAP_MINUTES} minutes or more is idle`, () => {
    expect(plannedMinutes(minutesAfter('2026-10-25T14:00:00Z', 0, IDLE_GAP_MINUTES - 1))).toBe(IDLE_GAP_MINUTES - 1);
    expect(plannedMinutes(minutesAfter('2026-10-25T14:00:00Z', 0, IDLE_GAP_MINUTES))).toBe(1);
  });

  test('order and duplicates do not matter; one event is a minute', () => {
    const times = [at('2026-10-25T14:05:00Z'), at('2026-10-25T14:00:00Z'), at('2026-10-25T14:05:00Z')];
    expect(plannedMinutes(times)).toBe(5);
    expect(plannedMinutes([at('2026-10-25T14:00:00Z')])).toBe(1);
    expect(plannedMinutes([])).toBe(1);
  });

  test('the label reads in minutes, then hours', () => {
    expect(plannedLabel(21)).toBe('21 min');
    expect(plannedLabel(119)).toBe('119 min');
    expect(plannedLabel(150)).toBe('2.5 hr');
    expect(plannedLabel(180)).toBe('3 hr');
  });
});
