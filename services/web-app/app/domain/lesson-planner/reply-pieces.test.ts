import { describe, expect, test } from 'bun:test';
import { pieceKeysInReply } from './reply-pieces';

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
