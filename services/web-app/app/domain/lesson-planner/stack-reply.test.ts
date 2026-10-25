import { describe, expect, test } from 'bun:test';
import { STACK_DECK_REPLY, stackReplyLine } from './stack-reply';

const DECK = '```yawp-slides\n{"title":"Sinners","slides":[{"layout":"title","title":"Sinners","speakerNotes":"Go."}]}\n```';

// Brian's round 4, item 6.
describe('stackReplyLine', () => {
  test('a reply with a deck says the new slides are ready, never the Lounge', () => {
    const reply = `The deck lives in your lesson stack rather than the Lounge, so it is built from what you have.\n\n${DECK}`;
    expect(stackReplyLine(reply)).toBe(STACK_DECK_REPLY);
    expect(STACK_DECK_REPLY).toBe("Here you go: new slides based on your revised stack. Everything's updated and ready to go!");
  });

  test('any other reply shows its first line', () => {
    expect(stackReplyLine('Shortened the hook to 10 minutes.\n\nMore.')).toBe('Shortened the hook to 10 minutes.');
    expect(stackReplyLine('```yawp-material\nx\n```\nDone.')).toBe('Done.');
  });
});
