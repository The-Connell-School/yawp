import { describe, expect, test } from 'bun:test';
import { blockMinutesInReply, pieceKeysInReply, segmentInStack, optionStepMinutes, stepSegments, stepsOfferingChoice } from './reply-pieces';
import { readPlanSteps } from './plan-steps';

const DECK = JSON.stringify({
  title: 'Day 1',
  slides: [{ layout: 'title', title: 'Day 1', speakerNotes: 'Go.' }],
});

const REPLY = [
  '# Day 1',
  '',
  '## Framing (5 min)',
  '',
  'Pick one.',
  '',
  '```yawp-material',
  'kind: notes',
  'slot: frame-hist',
  'title: Historical context',
  '---',
  'Vietnam.',
  '```',
  '',
  '```yawp-material',
  'kind: notes',
  'slot: frame-lit',
  'title: Literary context',
  '---',
  'Metafiction.',
  '```',
  '',
  '## Class starter (5 min)',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  'What do you carry?',
  '```',
  '',
  '## Exit ticket (5 min)',
  '',
  '```yawp-exit-ticket',
  'mode: basic',
  '```',
  '',
  '```yawp-slides',
  DECK,
  '```',
].join('\n');

describe("pieceKeysInReply (Brian's run 2, A4)", () => {
  test('every piece in the reply, in the order the reply has them', () => {
    // The class starter and exit ticket steps are nothing but their blocks,
    // so the blocks stand for them.
    expect(pieceKeysInReply(REPLY)).toEqual(['st', '0', '1', 'dp', 'ticket', 'deck']);
  });

  test('nothing to file in a question', () => {
    expect(pieceKeysInReply('Which class is this for?')).toEqual([]);
  });
});

describe('pieceKeysInReply — writing practice', () => {
  test('a practice set is a piece too', () => {
    expect(
      pieceKeysInReply('```yawp-practice\nlessons: comma-splices\n```\n\n```yawp-practice\nlessons: passive-voice\n```')
    ).toEqual(['pr', 'pr:1']);
  });
});

describe('blockMinutesInReply', () => {
  test("a step that is only its block lends the block its minutes", async () => {
    const { blockMinutesInReply } = await import('./reply-pieces');
    expect(blockMinutesInReply(REPLY)).toEqual({ dp: 5, ticket: 5 });
  });
});

describe("stepSegments: one status per segment (Brian's run 3, items 1, 2)", () => {
  const REPLY = [
    '## Class starter (5 min)',
    '',
    '```yawp-daily-pages',
    'kind: class-starter',
    'What do you carry?',
    '```',
    '',
    '## Hook (15 min)',
    '',
    'Bags out.',
    '',
    '## Framing (10 min)',
    '',
    '```yawp-material',
    'kind: notes',
    'title: Historical',
    '---',
    'Vietnam.',
    '```',
    '',
    '```yawp-material',
    'kind: notes',
    'title: The author',
    '---',
    'O’Brien.',
    '```',
  ].join('\n');

  test('a step with text is itself; a step that is only blocks is those blocks', () => {
    expect(stepSegments(REPLY)).toEqual({ st: ['dp'], 'st:1': ['st:1'], 'st:2': ['0', '1'] });
  });

  test('in the stack only when every piece is', () => {
    const added = new Set(['m1:0']);
    expect(segmentInStack('m1', ['0', '1'], added)).toBe(false);
    added.add('m1:1');
    expect(segmentInStack('m1', ['0', '1'], added)).toBe(true);
    expect(segmentInStack('m1', [], added)).toBe(false);
  });

  test("a step's minutes go to its block only when it holds one", () => {
    expect(blockMinutesInReply(REPLY)).toEqual({ dp: 5 });
  });
});

describe('stepsOfferingChoice: a step whose options each have their own Add (Kevin, Oct 22)', () => {
  const starter = (text: string) => '```yawp-daily-pages\nkind: class-starter\n' + text + '\n```';
  const reply = [
    '## Class starter (5 min)',
    'While everyone settles, students write to one of the three prompts below.',
    'Pick one:',
    starter('Think of a conversation where the real issue was never named.'),
    starter('Describe a time someone said one thing and meant another.'),
    starter('What do people avoid saying out loud?'),
    '## Mini-lesson (15 min)',
    'Teach the iceberg theory.',
    '## Exit ticket (5 min)',
    starter('One line: what was left unsaid?'),
  ].join('\n\n');

  test('three class starters under one step: that step offers a choice', () => {
    expect([...stepsOfferingChoice(reply)]).toEqual([readPlanSteps(reply)[0]!.key]);
  });

  test('a step with one block, or none, does not', () => {
    const one = ['## Class starter (5 min)', 'Write.', starter('One prompt.')].join('\n\n');
    expect(stepsOfferingChoice(one).size).toBe(0);
  });
});

describe("optionStepMinutes: a picked option carries its step's minutes (Brian's run 4, item 2)", () => {
  const ticket = (body: string) => '```yawp-exit-ticket\n' + body + '\n```';
  const starter = (text: string) => '```yawp-daily-pages\nkind: class-starter\n' + text + '\n```';
  test('each exit ticket under "Closing (5 min)" carries 5 minutes', () => {
    const reply = [
      '## Discussion (20 min)',
      'Talk about Holden.',
      '## Closing (5 min) {type: closing}',
      'Bring it back to the hat. Then pick a ticket.',
      ticket('mode: basic'),
      ticket('mode: basic'),
      ticket('mode: basic'),
    ].join('\n\n');
    expect(optionStepMinutes(reply)).toEqual({ ticket: 5, 'ticket:1': 5, 'ticket:2': 5 });
  });
  test('class starters under "Class starter (8 min): Pick one" carry 8', () => {
    const reply = ['## Class starter (8 min)', 'Pick one:', starter('One.'), starter('Two.'), '## Reading (40 min)', 'Read.'].join('\n\n');
    expect(Object.values(optionStepMinutes(reply))).toEqual([8, 8]);
  });
  test('a single block is not an option', () => {
    expect(optionStepMinutes(['## Closing (5 min)', 'Wrap up.', ticket('mode: basic'), '## Next (5 min)', 'Go.'].join('\n\n'))).toEqual({});
  });
});
