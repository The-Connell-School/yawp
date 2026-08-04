import { describe, expect, test } from 'bun:test';
import {
  STANDARD_OPENING_SUGGESTION,
  withStandardSuggestions,
} from './suggestions';

describe('withStandardSuggestions', () => {
  test('pins the data-driven option first on the opening reply', () => {
    const merged = withStandardSuggestions(
      ['10th grade English, 50 min, ~25 kids, pretty talkative'],
      { isOpeningReply: true }
    );
    expect(merged[0]).toBe(STANDARD_OPENING_SUGGESTION);
    expect(merged[1]).toBe(
      '10th grade English, 50 min, ~25 kids, pretty talkative'
    );
  });

  test('offers it even when the model suggested nothing at all', () => {
    expect(withStandardSuggestions([], { isOpeningReply: true })).toEqual([
      STANDARD_OPENING_SUGGESTION,
    ]);
  });

  test('does not repeat itself when the model wrote its own version', () => {
    const merged = withStandardSuggestions(
      [
        'Let me see my class list first',
        'Look at my classes and decide what they need',
        'Pull the data and go',
        '11th grade, 45 min, ~30 kids',
      ],
      { isOpeningReply: true }
    );
    expect(merged[0]).toBe(STANDARD_OPENING_SUGGESTION);
    // All three near-duplicates collapse into the pinned one.
    expect(merged).toEqual([
      STANDARD_OPENING_SUGGESTION,
      '11th grade, 45 min, ~30 kids',
    ]);
  });

  test('leaves later turns to the model', () => {
    const merged = withStandardSuggestions(
      ['Build a slide deck for this lesson', 'Write the exit ticket'],
      { isOpeningReply: false }
    );
    expect(merged).toEqual([
      'Build a slide deck for this lesson',
      'Write the exit ticket',
    ]);
    expect(merged).not.toContain(STANDARD_OPENING_SUGGESTION);
  });

  test('drops duplicates the model repeated', () => {
    expect(
      withStandardSuggestions(
        ['Build the deck', 'build the deck', 'Build the deck!'],
        { isOpeningReply: false }
      )
    ).toEqual(['Build the deck']);
  });

  test('ignores blank lines', () => {
    expect(
      withStandardSuggestions(['', '   ', 'Write the exit ticket'], {
        isOpeningReply: false,
      })
    ).toEqual(['Write the exit ticket']);
  });

  test('caps the row so it never becomes a wall of buttons', () => {
    const many = Array.from({ length: 12 }, (_unused, i) => `Option ${i + 1}`);
    expect(
      withStandardSuggestions(many, { isOpeningReply: true })
    ).toHaveLength(5);
    expect(
      withStandardSuggestions(many, { isOpeningReply: false })
    ).toHaveLength(5);
  });

  test('keeps the pinned option even when the model floods the row', () => {
    const many = Array.from({ length: 12 }, (_unused, i) => `Option ${i + 1}`);
    expect(withStandardSuggestions(many, { isOpeningReply: true })[0]).toBe(
      STANDARD_OPENING_SUGGESTION
    );
  });

  test('reads as something the teacher is saying, not asking', () => {
    // Chips are sent as the teacher's own message, so a question would be odd.
    expect(STANDARD_OPENING_SUGGESTION).not.toContain('?');
    expect(STANDARD_OPENING_SUGGESTION.toLowerCase()).toContain('my classes');
  });
});
