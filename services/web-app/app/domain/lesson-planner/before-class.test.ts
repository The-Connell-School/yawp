import { describe, expect, test } from 'bun:test';
import { beforeClass } from './before-class';

const ready = { over: 0, period: 50, deck: { built: true, stale: false }, missingWriting: 0, lessonDate: '2026-10-27' };

describe("Before class (Kevin's note 12a)", () => {
  test('all ticked: ready to teach', () => {
    const list = beforeClass(ready);
    expect(list.ready).toBe(true);
    expect(list.items.map((item) => item.key)).toEqual(['fits', 'slides', 'writing', 'date']);
  });

  test('each item ticks itself off from the lesson', () => {
    const list = beforeClass({ over: 15, period: 60, deck: { built: true, stale: true }, missingWriting: 2, lessonDate: null });
    expect(list.ready).toBe(false);
    expect(list.items.map((item) => [item.label, item.done])).toEqual([
      ['Fits the period (15 min over now)', false],
      ['Slides up to date (the lesson changed)', false],
      ['Writing made in Yawp! or on paper (2 to go)', false],
      ['Date picked', false],
    ]);
  });

  test("no period: nothing to pick, and it doesn't hold up ready (Brian's round 3, 1.5)", () => {
    const list = beforeClass({ ...ready, period: null, deck: { built: false, stale: false } });
    expect(list.items.map((item) => item.key)).toEqual(['slides', 'writing', 'date']);
    expect(list.items.some((item) => /period length/i.test(item.label))).toBe(false);
    expect(list.items[0]).toEqual({ key: 'slides', label: 'Slides built', done: false });
    expect(beforeClass({ ...ready, period: null }).ready).toBe(true);
  });
});
