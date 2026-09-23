import { describe, expect, test } from 'bun:test';
import {
  FOLLOW_ON_SUGGESTIONS,
  looksLikeLessonPlan,
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

describe('withStandardSuggestions — what comes after a plan', () => {
  test('always offers the deck and the handout, in the same words', () => {
    const merged = withStandardSuggestions(['Something the model thought of'], {
      isOpeningReply: false,
      deliveredPlan: true,
    });
    expect(merged.slice(0, 2)).toEqual([
      FOLLOW_ON_SUGGESTIONS.deck,
      FOLLOW_ON_SUGGESTIONS.handout,
    ]);
    expect(merged).toContain('Something the model thought of');
  });

  test('does not offer to build what the reply just built', () => {
    const merged = withStandardSuggestions([], {
      isOpeningReply: false,
      deliveredPlan: true,
      produced: { deck: true, handout: false },
    });
    expect(merged).not.toContain(FOLLOW_ON_SUGGESTIONS.deck);
    expect(merged).toContain(FOLLOW_ON_SUGGESTIONS.handout);
  });

  test('does not offer to rebuild what is already in the packet', () => {
    const merged = withStandardSuggestions([], {
      isOpeningReply: false,
      deliveredPlan: true,
      inPacket: { deck: true, handout: true },
    });
    expect(merged).not.toContain(FOLLOW_ON_SUGGESTIONS.deck);
    expect(merged).not.toContain(FOLLOW_ON_SUGGESTIONS.handout);
  });

  test('drops the model’s own version of the same offer', () => {
    const merged = withStandardSuggestions(
      ['Build a slide deck for this lesson', 'Make it shorter'],
      { isOpeningReply: false, deliveredPlan: true }
    );
    expect(merged.filter((option) => /slide deck/i.test(option))).toHaveLength(
      1
    );
  });

  test('leaves an ordinary turn alone', () => {
    const merged = withStandardSuggestions(['Sure, go ahead'], {
      isOpeningReply: false,
      deliveredPlan: false,
    });
    expect(merged).toEqual(['Sure, go ahead']);
  });
});

describe('withStandardSuggestions — the slider owns the question of length', () => {
  test('drops an option that is nothing but the period length', () => {
    expect(
      withStandardSuggestions(['50 minutes', 'English 10 · Period 3'], {
        isOpeningReply: false,
        asksForMinutes: true,
      })
    ).toEqual(['English 10 · Period 3']);
  });

  test('keeps the rest of an option that merely tacks the length on', () => {
    expect(
      withStandardSuggestions(
        ['English 10 · Period 3, 50 minutes, about 25 students'],
        { isOpeningReply: false, asksForMinutes: true }
      )
    ).toEqual(['English 10 · Period 3, about 25 students']);
  });

  test('leaves the length alone when no slider was drawn', () => {
    const options = ['50 minutes, about 25 students'];
    expect(withStandardSuggestions(options, { isOpeningReply: false })).toEqual(
      options
    );
  });

  test('does not mistake a timed activity for the period length', () => {
    const options = ['Give them 10 minutes to write, then share'];
    expect(
      withStandardSuggestions(options, {
        isOpeningReply: false,
        asksForMinutes: true,
      })
    ).toEqual(options);
  });
});

describe('looksLikeLessonPlan', () => {
  test('recognises a reply built out of sections', () => {
    expect(
      looksLikeLessonPlan(
        '## Objective\n\nExplain evidence.\n\n## Lesson Sequence\n\n1. Warm-up'
      )
    ).toBe(true);
  });

  test('is not fooled by a one-heading answer or a chat turn', () => {
    expect(looksLikeLessonPlan('## Two options\n\nWhich do you want?')).toBe(
      false
    );
    expect(looksLikeLessonPlan('Which class is this for?')).toBe(false);
  });
});

describe('withStandardSuggestions — a plan on the very first reply', () => {
  test('offers the artifacts rather than the intake option', () => {
    // A teacher who gave full context up front gets a plan immediately. Pinning
    // "look at my classes and tell me what they need work on" after a finished
    // plan is nonsense; the deck and the handout are what comes next.
    const merged = withStandardSuggestions([], {
      isOpeningReply: true,
      deliveredPlan: true,
    });

    expect(merged).not.toContain(STANDARD_OPENING_SUGGESTION);
    expect(merged.slice(0, 2)).toEqual([
      FOLLOW_ON_SUGGESTIONS.deck,
      FOLLOW_ON_SUGGESTIONS.handout,
    ]);
  });

  test('still pins the intake option when the opening reply is a question', () => {
    expect(
      withStandardSuggestions(['English 10 · Period 3'], {
        isOpeningReply: true,
        deliveredPlan: false,
      })[0]
    ).toBe(STANDARD_OPENING_SUGGESTION);
  });
});

describe('withStandardSuggestions — a tile that asked for something else', () => {
  test('leaves the data-driven option off when the start does not want it', () => {
    // "Make me an exit ticket" is not a teacher asking what their class needs
    // work on. Pinning it first answers a question nobody asked.
    const suggestions = withStandardSuggestions(
      ['The lesson I planned: Evidence that earns its place'],
      { isOpeningReply: true, pinOpening: false }
    );
    expect(suggestions).toEqual([
      'The lesson I planned: Evidence that earns its place',
    ]);
  });

  test('still pins it by default, so existing callers are unchanged', () => {
    expect(withStandardSuggestions([], { isOpeningReply: true })[0]).toBe(
      STANDARD_OPENING_SUGGESTION
    );
  });
});
