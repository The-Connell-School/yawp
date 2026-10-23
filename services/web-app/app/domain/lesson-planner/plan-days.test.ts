import { describe, expect, test } from 'bun:test';
import { multiDayTitle, readPlanDays } from './plan-days';
import { readPlanSteps } from './plan-steps';

const WEEK = [
  '# Lord of the Flies: the first week',
  '',
  'Here is the four-day flow.',
  '',
  '## Day 1: Lecture — the island (50 min)',
  '',
  '### Class starter (5 min) {type: class_starter}',
  'Write about a time rules broke down.',
  '',
  '### Mini-lecture: Golding and the war (25 min) {type: context}',
  'The war behind the book.',
  '',
  '### Pair talk (10 min) {type: activity}',
  'What does the conch stand for?',
  '',
  '### Read aloud (5 min) {type: read_aloud}',
  'The opening page.',
  '',
  '### Closing (5 min) {type: closing}',
  'Exit ticket: one rule you would make.',
  '',
  '## Day 2: Close reading (50 min)',
  '',
  '### Class starter (5 min)',
  'Reread the conch scene.',
  '',
  '### Close reading (45 min)',
  'Annotate chapter 1.',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  '## not a heading',
  '```',
  '',
  '---',
  '',
  'Want to refine any of this?',
].join('\n');

describe("readPlanDays: each day a lesson of its own (Brian's run 5, items 1 and 3)", () => {
  test('two days, with titles and minutes', () => {
    const days = readPlanDays(WEEK);
    expect(days.map((day) => [day.day, day.title, day.minutes])).toEqual([
      [1, 'Lecture — the island', 50],
      [2, 'Close reading', 50],
    ]);
  });

  test("a day's steps are steps, each with its minutes: 5 + 25 + 10 + 5 + 5", () => {
    const [day1] = readPlanDays(WEEK);
    expect(day1!.content.startsWith('# Day 1: Lecture — the island (50 min)')).toBe(true);
    const steps = readPlanSteps(day1!.content);
    expect(steps.map((step) => step.minutes)).toEqual([5, 25, 10, 5, 5]);
    expect(steps[1]!.title).toBe('Mini-lecture: Golding and the war');
  });

  test("the last day leaves the planner's closing question behind, and a fence keeps its text", () => {
    const [, day2] = readPlanDays(WEEK);
    expect(day2!.content).not.toContain('Want to refine');
    expect(day2!.content).toContain('## not a heading');
    expect(readPlanSteps(day2!.content).map((step) => step.title)).toEqual(['Class starter', 'Close reading']);
  });

  test('a single lesson, or one "Day 1", is not a multi-day plan', () => {
    expect(readPlanDays('## Hook (10 min)\nGo.\n\n## Read (40 min)\nRead.')).toEqual([]);
    expect(readPlanDays('## Day 1: Hook (10 min)\nGo.')).toEqual([]);
  });

  test('days as # headings with ## steps work too', () => {
    const days = readPlanDays('# Day 1: Quiz\n\n## Vocab quiz (15 min)\nQuiz.\n\n## Daily Pages (10 min)\nWrite.\n\n# Day 2: Discussion\n\n## Socratic seminar (40 min)\nTalk.');
    expect(days).toHaveLength(2);
    expect(readPlanSteps(days[0]!.content).map((step) => step.minutes)).toEqual([15, 10]);
  });

  test("the unit's name: the reply's own title, else the count", () => {
    expect(multiDayTitle(WEEK, readPlanDays(WEEK))).toBe('Lord of the Flies: the first week');
    const plain = '## Day 1: A\n\n### X (5 min)\nx\n\n## Day 2: B\n\n### Y (5 min)\ny';
    expect(multiDayTitle(plain, readPlanDays(plain))).toBe('A 2-day plan');
  });
});
