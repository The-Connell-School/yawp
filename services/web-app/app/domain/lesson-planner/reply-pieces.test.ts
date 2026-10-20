import { describe, expect, test } from 'bun:test';
import { blockMinutesInReply, pieceKeysInReply, segmentInStack, stepSegments } from './reply-pieces';

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
