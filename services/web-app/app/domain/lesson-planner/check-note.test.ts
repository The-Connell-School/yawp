import { describe, expect, test } from 'bun:test';
import { checkNoteWords, withCheckNote } from './check-note';

describe('withCheckNote', () => {
  test('goes just before the closing question, outside any block', () => {
    const reply =
      'The plan.\n\n```yawp-slides\n{"a": "Why?"}\n```\n\nWant to refine or edit any part of this?';
    const out = withCheckNote(reply, [
      '"I am one of the few honest people" is in chapter 3, not chapter 1.',
    ]);
    expect(out.indexOf('**Check before class:**')).toBeLessThan(
      out.indexOf('Want to refine')
    );
    expect(out.indexOf('**Check before class:**')).toBeGreaterThan(
      out.indexOf('```yawp-slides')
    );
    expect(out).toContain(
      '- "I am one of the few honest people" is in chapter 3, not chapter 1.'
    );
  });

  test('at the end when there is no closing question; nothing when there is nothing to check; never twice', () => {
    expect(withCheckNote('The plan.', ['A date.'])).toBe(
      'The plan.\n\n**Check before class:**\n- A date.\n'
    );
    expect(withCheckNote('The plan.', [])).toBe('The plan.');
    const once = withCheckNote('The plan.', ['A date.']);
    expect(withCheckNote(once, ['Another.'])).toBe(once);
  });

  test('five at most, no repeats', () => {
    const out = withCheckNote('x', ['a', 'a', 'b', 'c', 'd', 'e', 'f']);
    expect(out.match(/^- /gm)?.length).toBe(5);
  });
});

describe('checkNoteWords', () => {
  test('a fact found inside a slide is shown as its words, not the deck\'s JSON', () => {
    expect(checkNoteWords('"date": "Sep 1692",\n          "title": "19 hanged",')).toBe('Sep 1692 · 19 hanged');
  });
  test('prose is left as it is', () => {
    expect(checkNoteWords('The trials end in  October 1692.')).toBe('The trials end in October 1692.');
  });
});
