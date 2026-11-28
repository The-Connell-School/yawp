import { describe, expect, test } from 'bun:test';
import { aboutSettledQuotation, checkNoteWords, withCheckNote } from './check-note';

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

describe('aboutSettledQuotation', () => {
  const honest = 'Everyone suspects himself of at least one of the cardinal virtues, and this is mine: I am one of the few honest people that I have ever known.';
  test('a flag about a quotation the source text settled is not shown', () => {
    expect(aboutSettledQuotation({ wrong: 'Nick tells us, on page 1, that he is "one of the few honest people"', why: 'The line comes later in Chapter 1, in the paragraph "Everyone suspects himself of at least one of the cardinal virtues, and this is mine"' }, [honest])).toBe(true);
  });
  test('a flag about something else is', () => {
    expect(aboutSettledQuotation({ wrong: 'The novel was published in 1924', why: 'It was published in April 1925.' }, [honest])).toBe(false);
  });
});
