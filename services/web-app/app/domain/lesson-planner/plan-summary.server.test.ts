import { describe, expect, test } from 'bun:test';
import { summarizeLessonPlan, PLAN_SUMMARY_SYSTEM } from './plan-summary.server';

const steps = [
  { title: 'Class starter', minutes: 5, summary: 'Write.', purpose: '' },
  { title: 'Read aloud', minutes: 20, summary: 'Read.', purpose: '' },
];

describe("summarizeLessonPlan (Brian's run 2, D1)", () => {
  test('asks for a short summary and a purpose per step, never the full texts', async () => {
    let asked = '';
    const result = await summarizeLessonPlan({
      title: 'Day 1',
      className: 'English 11',
      periodMinutes: 50,
      steps,
      complete: async (user) => {
        asked = user;
        return JSON.stringify({
          overview: 'Students enter the book.',
          goals: ['Students will name what an object reveals.'],
          teacherWill: ['Read aloud.'],
          steps: [
            { summary: 'Students write.', purpose: 'Starts from their thinking.' },
            { summary: 'You read the opening.', purpose: 'Hears the list form.' },
          ],
          closing: 'Collect tickets.',
        });
      },
    });
    expect(asked).toContain('1. Class starter (5 min)');
    expect(asked).toContain('2. Read aloud (20 min)');
    expect(result?.steps).toHaveLength(2);
    expect(result?.overview).toBe('Students enter the book.');
    expect(PLAN_SUMMARY_SYSTEM).toContain('Never reproduce the full text');
    expect(PLAN_SUMMARY_SYSTEM).toContain('Yawp!');
  });

  test('a reply with the wrong number of steps is not used', async () => {
    const result = await summarizeLessonPlan({
      title: 'Day 1',
      className: null,
      periodMinutes: null,
      steps,
      complete: async () => JSON.stringify({ steps: [{ summary: 'one', purpose: 'x' }] }),
    });
    expect(result).toBeNull();
  });

  test('a failed call falls back to nothing, not an error', async () => {
    const result = await summarizeLessonPlan({
      title: 'Day 1',
      className: null,
      periodMinutes: null,
      steps,
      complete: async () => {
        throw new Error('down');
      },
    });
    expect(result).toBeNull();
  });

  test('reads JSON wrapped in a fence or prose', async () => {
    const result = await summarizeLessonPlan({
      title: 'Day 1',
      className: null,
      periodMinutes: null,
      steps,
      complete: async () =>
        'Here you go:\n```json\n' +
        JSON.stringify({
          overview: 'x',
          goals: ['g'],
          teacherWill: ['t'],
          steps: [
            { summary: 'a', purpose: 'b' },
            { summary: 'c', purpose: 'd' },
          ],
          closing: 'z',
        }) +
        '\n```',
    });
    expect(result?.steps?.[1]).toEqual({ summary: 'c', purpose: 'd' });
  });
});
