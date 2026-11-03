import { describe, expect, test } from 'bun:test';
import { plannerHistory, replyOutline } from './planner-history';

const STRUCTURE =
  'I want a repeatable week: Day 1 lecture, Day 2 close reading, Day 3 vocab quiz plus Daily Pages, Day 4 discussion.';
const longPlan = (name: string) =>
  `# ${name}\n\n## Day 1: Lecture (50 min)\n\n### Class starter (5 min)\n${'Teach it. '.repeat(900)}\n\n## Day 2: Close reading (50 min)\n\n### Close reading (45 min)\nRead.`;

describe("plannerHistory: the conversation is the planner's first memory (Brian's run 5, item 2)", () => {
  const messages = [
    { role: 'user', content: STRUCTURE },
    { role: 'assistant', content: longPlan('Week one') },
    { role: 'user', content: 'Good. Now add handouts.' },
    { role: 'assistant', content: longPlan('Week one, with handouts') },
    { role: 'user', content: 'Rebuild the 15-day unit with that structure.' },
  ];

  test("the teacher's first message, with their structure, is always there", () => {
    const history = plannerHistory(messages, 12_000);
    expect(history[0]).toEqual({ role: 'user', content: STRUCTURE });
    expect(history.filter((message) => message.role === 'user')).toHaveLength(3);
  });

  test('replies past the budget are shortened to their outline, never dropped, so turns still alternate', () => {
    const history = plannerHistory(messages, 12_000);
    expect(history.map((message) => message.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user']);
    expect(history[3]!.content).toBe(messages[3]!.content);
    expect(history[1]!.content).toContain('(An earlier reply of yours, shortened to its outline.)');
    expect(history[1]!.content).toContain('## Day 1: Lecture (50 min)');
    expect(history[1]!.content.length).toBeLessThan(1_400);
  });

  test('everything fits: nothing is touched', () => {
    expect(plannerHistory(messages, 1_000_000)).toEqual(messages);
  });

  test('an outline leaves out fenced blocks', () => {
    expect(replyOutline('# Day\n\n```yawp-slides\n# not this\n```\n\n## Step (5 min)')).not.toContain('not this');
  });
});
