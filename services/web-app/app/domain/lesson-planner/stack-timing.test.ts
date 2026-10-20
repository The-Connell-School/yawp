import { describe, expect, test } from 'bun:test';
import { stackTiming, statusText, timeFixes, type TimedStep } from './stack-timing';

// Brian's day one stack, in the redesign's order.
const DAY_ONE: TimedStep[] = [
  { id: 'starter', title: 'Four minutes of writing, then a share', type: 'class_starter', minutes: 5, isWriting: true },
  { id: 'hook', title: 'Hook activity: What’s in your bag?', type: 'activity', minutes: 15, isWriting: false },
  { id: 'hist', title: 'Frame — Historical context', type: 'context', minutes: 4, isWriting: false },
  { id: 'author', title: 'Frame — The author', type: 'context', minutes: 3, isWriting: false },
  { id: 'lit', title: 'Frame — Literary context', type: 'context', minutes: 3, isWriting: false },
  { id: 'read', title: 'Read aloud: the opening of the title story', type: 'read_aloud', minutes: 12, isWriting: false },
  { id: 'dp', title: 'O’Brien lists what they carried', type: 'daily_pages', minutes: 5, isWriting: true },
  { id: 'close', title: 'Closing', type: 'closing', minutes: 3, isWriting: false },
];

describe('stackTiming', () => {
  test('the total is the sum of the steps, and each step knows its start minute', () => {
    const timing = stackTiming(DAY_ONE, 50);
    expect(timing.total).toBe(50);
    expect(timing.blocks.map((block) => block.startsAt)).toEqual([0, 5, 20, 24, 27, 30, 42, 47]);
    expect(timing.status).toBe('Right on time');
    expect(timing.leftover).toBe(0);
  });

  test('writing: 10 of 50 minutes is 20%, from Class Starter + Daily Pages', () => {
    const timing = stackTiming(DAY_ONE, 50);
    expect(timing.writingMinutes).toBe(10);
    expect(timing.writingPercent).toBe(20);
    expect(timing.writingSources).toBe('Class Starter + Daily Pages');
  });

  test('writing % is over the planned total when the stack runs longer', () => {
    const timing = stackTiming([...DAY_ONE, { id: 'x', title: 'Extra', type: 'activity', minutes: 50, isWriting: false }], 50);
    expect(timing.writingPercent).toBe(10);
  });

  test('a step with no time gets its type default, marked as suggested', () => {
    const timing = stackTiming([{ id: 'c', title: 'Frame', type: 'context', minutes: null, isWriting: false }], 50);
    expect(timing.blocks[0]!.minutes).toBe(5);
    expect(timing.blocks[0]!.suggested).toBe(true);
    expect(timing.status).toBe('45 min to spare');
  });

  test('status reads over and to spare', () => {
    expect(statusText(57, 50)).toBe('7 min over');
    expect(statusText(44, 50)).toBe('6 min to spare');
    expect(statusText(44, null)).toBe('44 min planned');
  });
});

describe('timeFixes: at most two, never cutting writing', () => {
  test('nothing when the stack fits', () => {
    expect(timeFixes(stackTiming(DAY_ONE, 50))).toEqual([]);
  });

  test('over: trim the longest non-writing step, or move a Context step to tomorrow', () => {
    const fixes = timeFixes(stackTiming(DAY_ONE, 45));
    expect(fixes).toHaveLength(2);
    expect(fixes[0]).toMatchObject({ id: 'trim', stepId: 'hook', toMinutes: 10, leaves: 0 });
    // The smallest Context step that covers 5 over… none does, so the longest.
    expect(fixes[1]).toMatchObject({ id: 'tomorrow', stepId: 'hist', leaves: 1 });
    expect(fixes[1]!.text).toContain('gets you to 1 over');
  });

  test('a trim never goes below 3 minutes and says what it reaches', () => {
    const fixes = timeFixes(stackTiming(DAY_ONE, 30));
    expect(fixes[0]).toMatchObject({ id: 'trim', stepId: 'hook', toMinutes: 3, leaves: 8 });
  });

  test('a Context step that covers the overage is the one moved', () => {
    const fixes = timeFixes(stackTiming(DAY_ONE, 47));
    expect(fixes[1]).toMatchObject({ id: 'tomorrow', stepId: 'author', leaves: 0 });
  });

  test('writing steps are never touched, even when longest', () => {
    const steps: TimedStep[] = [
      { id: 'dp', title: 'Daily Pages', type: 'daily_pages', minutes: 30, isWriting: true },
      { id: 'hook', title: 'Hook', type: 'activity', minutes: 10, isWriting: false },
    ];
    const fixes = timeFixes(stackTiming(steps, 35));
    expect(fixes.map((fix) => fix.stepId)).toEqual(['hook']);
  });
});
