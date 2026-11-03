import { describe, expect, test } from 'bun:test';
import { replyTopScroll, transcriptScrollTarget } from './transcript-scroll';

describe('transcriptScrollTarget: where the chat lands', () => {
  test('nothing said: the opening page stays where it is', () => {
    expect(transcriptScrollTarget([], false)).toBeNull();
  });

  test('waiting on a reply: the bottom, so the question and the progress show', () => {
    expect(transcriptScrollTarget([{ role: 'user' }], true)).toBe('bottom');
    expect(transcriptScrollTarget([{ role: 'assistant' }, { role: 'user' }], false)).toBe('bottom');
  });

  test('a reply landed, or a saved lesson opened: the top of the last reply, to read down from', () => {
    expect(transcriptScrollTarget([{ role: 'user' }, { role: 'assistant' }], false)).toBe('reply-top');
  });
});

describe('replyTopScroll', () => {
  test('the reply’s top sits a little below the top of the transcript', () => {
    // Transcript at 100px on screen, scrolled 300px; the reply is at 900px on screen.
    expect(replyTopScroll({ containerTop: 100, scrollTop: 300, replyTop: 900 })).toBe(1084);
  });

  test('never above the top', () => {
    expect(replyTopScroll({ containerTop: 100, scrollTop: 0, replyTop: 105 })).toBe(0);
  });
});
