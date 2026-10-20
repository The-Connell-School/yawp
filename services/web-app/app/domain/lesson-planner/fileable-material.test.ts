import { describe, expect, test } from 'bun:test';
import { fileableMaterial, stepColumns } from './fileable-material';

const REPLY = [
  '## Hook: What’s in your bag? (15 min) {type: activity}',
  '',
  'Students lay out what is in their bag.',
  '',
  '## Framing (10 min)',
  '',
  '```yawp-material',
  'kind: notes',
  'title: Historical Context',
  'minutes: 4',
  'type: context',
  '---',
  'The Vietnam War, 1965–1973.',
  '```',
  '',
  '## Daily Pages (8 min)',
  '',
  '```yawp-daily-pages',
  'kind: daily-pages',
  'title: What one item reveals',
  'O’Brien lists what every soldier carries — down to the ounce. What would your list say about you?',
  '```',
].join('\n');

describe("fileableMaterial (Brian's run 3, item 9)", () => {
  test('a step files with its minutes and the planner’s type', () => {
    const hook = fileableMaterial(REPLY, 'st')!;
    expect(hook.title).toBe('Hook: What’s in your bag? (15 min)');
    expect(stepColumns(hook)).toEqual({ minutes: 15, stepType: 'activity' });
  });

  test('a framing note keeps its own minutes', () => {
    const note = fileableMaterial(REPLY, '0')!;
    expect(note.title).toBe('Historical Context (4 min)');
    expect(stepColumns(note)).toEqual({ minutes: 4, stepType: 'context' });
  });

  test('Daily Pages has a short real title and its step’s minutes', () => {
    const daily = fileableMaterial(REPLY, 'dp')!;
    expect(daily.title).toBe('Daily Pages: What one item reveals (8 min)');
    expect(daily.minutes).toBe(8);
  });
});
