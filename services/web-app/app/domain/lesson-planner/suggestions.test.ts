import { describe, expect, test } from 'bun:test';
import {
  mentionsRoomPersonality,
  STANDARD_OPENING_SUGGESTION,
  withStandardSuggestions,
} from './suggestions';

describe('withStandardSuggestions', () => {
  test('pins the data-driven option first on the opening reply', () => {
    const merged = withStandardSuggestions(['10th grade English, 50 min'], {
      isOpeningReply: true,
    });
    expect(merged[0]).toBe(STANDARD_OPENING_SUGGESTION);
    expect(merged[1]).toBe('10th grade English, 50 min');
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

describe('withStandardSuggestions — the room is not a default axis', () => {
  test('trims the personality clause off an option the teacher never asked for', () => {
    // Straight from a real row: every option was a skill crossed with how
    // chatty the room is, which the teacher had said nothing about.
    const merged = withStandardSuggestions(
      [
        'Evidence/Support — 50-minute period, talkative room',
        'Evidence/Support — 80-minute block, quieter group',
        'Grammar/Syntax/Formatting — 50-minute period, talkative room',
        'Grammar/Syntax/Formatting — 80-minute block, quieter group',
      ],
      { isOpeningReply: false, teacherRaisedRoomPersonality: false }
    );

    expect(merged).toEqual([
      'Evidence/Support — 50-minute period',
      'Evidence/Support — 80-minute block',
      'Grammar/Syntax/Formatting — 50-minute period',
      'Grammar/Syntax/Formatting — 80-minute block',
    ]);
  });

  test('leaves the options alone once the teacher brings the room up', () => {
    const options = [
      'Evidence/Support — 50-minute period, talkative room',
      'Evidence/Support — 80-minute block, quieter group',
    ];
    expect(
      withStandardSuggestions(options, {
        isOpeningReply: false,
        teacherRaisedRoomPersonality: true,
      })
    ).toEqual(options);
  });

  test('drops an option that is nothing but the room', () => {
    expect(
      withStandardSuggestions(
        ['They talk freely — I need structure more than warm-up', 'Period 3'],
        { isOpeningReply: false, teacherRaisedRoomPersonality: false }
      )
    ).toEqual(['Period 3']);
  });

  test('strips a bare temperament tacked onto the end', () => {
    expect(
      withStandardSuggestions(
        ['10th grade, 50 min, talkative', '11th grade, 45 min, quiet'],
        { isOpeningReply: false, teacherRaisedRoomPersonality: false }
      )
    ).toEqual(['10th grade, 50 min', '11th grade, 45 min']);
  });

  test('does not strip a clause that only looks like the room', () => {
    // "quiet writing time" is an activity, not a description of the class.
    expect(
      withStandardSuggestions(['Period 3, 10 minutes of quiet writing time'], {
        isOpeningReply: false,
        teacherRaisedRoomPersonality: false,
      })
    ).toEqual(['Period 3, 10 minutes of quiet writing time']);
  });

  test('treats the room as fair game by default, for callers that do not know', () => {
    const options = ['Evidence/Support — 50-minute period, talkative room'];
    expect(withStandardSuggestions(options, { isOpeningReply: false })).toEqual(
      options
    );
  });
});

describe('mentionsRoomPersonality', () => {
  test('recognises a teacher describing the room', () => {
    expect(
      mentionsRoomPersonality([
        'My second period class is super introverted, pulling teeth',
      ])
    ).toBe(true);
    expect(mentionsRoomPersonality(['They are really talkative'])).toBe(true);
    expect(mentionsRoomPersonality(['This group is shy about sharing'])).toBe(
      true
    );
  });

  test('does not read it into an ordinary planning request', () => {
    expect(
      mentionsRoomPersonality([
        'Help me plan a lesson on conclusion paragraphs',
        'Make it a 50-minute period with quiet writing time',
      ])
    ).toBe(false);
  });
});
