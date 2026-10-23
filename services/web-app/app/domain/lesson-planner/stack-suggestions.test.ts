import { describe, expect, test } from 'bun:test';
import { suggestedPieces } from './stack-suggestions';

const REPLY = [
  '## Class starter (5 min)',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  'title: Four minutes of writing',
  'What do you carry?',
  '```',
  '',
  '## Hook (15 min) {type: activity}',
  '',
  'Students lay out their bags. Pairs share.',
  '',
  '## Framing (6 min)',
  '',
  '```yawp-material',
  'kind: notes',
  'title: Frame — The author',
  'minutes: 3',
  'type: context',
  '---',
  'Tim O’Brien was drafted in 1968.',
  '```',
].join('\n');

const SWAP = [
  'Two more you could use.',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  'title: The heaviest thing you’ve carried',
  'Write about something heavy you once carried, real or not.',
  '```',
].join('\n');

describe('suggestedPieces: "From your conversation" (stack page redesign)', () => {
  test('every piece the planner offered that is not in the stack, newest reply first', () => {
    const pieces = suggestedPieces({
      messages: [
        { id: 'm1', content: REPLY },
        { id: 'm2', content: SWAP },
      ],
      inStack: new Set(['m1:dp']),
      stackSlots: new Set(),
    });
    expect(pieces.map((piece) => piece.title)).toEqual([
      'The heaviest thing you’ve carried',
      'Hook',
      'Frame — The author',
    ]);
    const hook = pieces[1]!;
    expect(hook).toMatchObject({ messageId: 'm1', key: 'st:1', type: 'activity', minutes: 15, isWriting: false });
    expect(hook.line).toBe('Students lay out their bags.');
    expect(pieces[0]).toMatchObject({ type: 'class_starter', isWriting: true, minutes: null });
    expect(pieces[2]).toMatchObject({ type: 'context', minutes: 3 });
  });

  test('a version of something already in the stack is not offered again', () => {
    const pieces = suggestedPieces({
      messages: [{ id: 'm1', content: REPLY }],
      inStack: new Set(),
      stackSlots: new Set(['notes:frame-the-author']),
    });
    expect(pieces.map((piece) => piece.title)).not.toContain('Frame — The author');
  });
});
