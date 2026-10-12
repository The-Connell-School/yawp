import { describe, expect, test } from 'bun:test';
import {
  DONE_FOR_TODAY_SUGGESTION,
  FOLLOW_ON_SUGGESTIONS,
  FROM_STACK_SUGGESTIONS,
  asksForDeck,
  asksToSwapStarter,
  isFileActionSuggestion,
  looksLikeLessonPlan,
  SWAP_STARTER_SUGGESTION,
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

describe("withStandardSuggestions — a clear end (Brian's review, D2)", () => {
  test('offers "I\'m done for today" once the lesson has its deck or handout', () => {
    const chips = withStandardSuggestions(['A version for period 5'], {
      isOpeningReply: false,
      deliveredPlan: true,
      inPacket: { deck: true, handout: true },
      offerDone: true,
    });
    expect(chips.at(-1)).toBe(DONE_FOR_TODAY_SUGGESTION);
    expect(chips).toContain('A version for period 5');
  });

  test('also after the reply that built the deck', () => {
    const chips = withStandardSuggestions([], {
      isOpeningReply: false,
      produced: { deck: true },
      offerDone: true,
    });
    expect(chips).toEqual([DONE_FOR_TODAY_SUGGESTION]);
  });

  test('never before anything has been built', () => {
    const chips = withStandardSuggestions([], {
      isOpeningReply: false,
      deliveredPlan: true,
      offerDone: true,
    });
    expect(chips).not.toContain(DONE_FOR_TODAY_SUGGESTION);
  });

  test('not without the flag', () => {
    const chips = withStandardSuggestions([], {
      isOpeningReply: false,
      produced: { deck: true },
    });
    expect(chips).not.toContain(DONE_FOR_TODAY_SUGGESTION);
  });

  test('keeps its place even when the model filled every slot', () => {
    const chips = withStandardSuggestions(['a', 'b', 'c', 'd', 'e', 'f'], {
      isOpeningReply: false,
      produced: { deck: true, handout: true },
      offerDone: true,
    });
    expect(chips.length).toBeLessThanOrEqual(5);
    expect(chips.at(-1)).toBe(DONE_FOR_TODAY_SUGGESTION);
  });
});

describe("withStandardSuggestions — building from the stack (Brian's review, B6)", () => {
  test('says "from the stack" once the teacher has filed pieces', () => {
    const chips = withStandardSuggestions([], {
      isOpeningReply: false,
      deliveredPlan: true,
      stackHasPieces: true,
    });
    expect(chips).toContain(FROM_STACK_SUGGESTIONS.deck);
    expect(chips).toContain(FROM_STACK_SUGGESTIONS.handout);
    expect(chips).not.toContain(FOLLOW_ON_SUGGESTIONS.deck);
  });

  test('keeps the original wording with an empty stack', () => {
    const chips = withStandardSuggestions([], {
      isOpeningReply: false,
      deliveredPlan: true,
    });
    expect(chips).toContain(FOLLOW_ON_SUGGESTIONS.deck);
  });
});

describe("file actions are the app's, never a chip (Brian's run 2, S2)", () => {
  test.each([
    'Create Lesson Plan',
    'Save Lesson Plan as PDF',
    'Print Lesson Plan',
    'Download the handout',
    'Export this to Google Docs',
    'Save it as a Word document',
    'Print the slides',
  ])('"%s" is a file action', (chip) => {
    expect(isFileActionSuggestion(chip)).toBe(true);
  });

  test.each([
    'Build the slide deck for this lesson',
    'Build the student handout for this lesson',
    'Make a shorter version for Period 3',
    'Create a lesson plan on comma splices',
    'Swap out the class starter prompt',
    "I'm done for today",
  ])('"%s" is not', (chip) => {
    expect(isFileActionSuggestion(chip)).toBe(false);
  });

  test('a file-action chip is dropped, after a plan and on any other turn', () => {
    const afterPlan = withStandardSuggestions(
      ['Save Lesson Plan as PDF', 'Make a version for Period 3'],
      { isOpeningReply: false, deliveredPlan: true }
    );
    expect(afterPlan).not.toContain('Save Lesson Plan as PDF');
    expect(afterPlan).toContain('Make a version for Period 3');

    const plain = withStandardSuggestions(['Print Lesson Plan', 'Keep going'], {
      isOpeningReply: false,
    });
    expect(plain).toEqual(['Keep going']);
  });
});

describe("looksLikeLessonPlan — a plan written with bold steps (Brian's run 2, E4)", () => {
  const bold =
    '**Class starter (5 min)** — write about something you carry.\n\n**Read aloud (15 min)** — the first pages.';

  test('two timed bold steps are a plan, under stack v2', () => {
    expect(looksLikeLessonPlan(bold, { boldSteps: true })).toBe(true);
    expect(
      looksLikeLessonPlan('1. **Read aloud** (15 min): the first pages.\n2. **Pair talk** — 8 minutes.', {
        boldSteps: true,
      })
    ).toBe(true);
  });

  test('flag off: unchanged, headings only', () => {
    expect(looksLikeLessonPlan(bold)).toBe(false);
  });

  test('one bold phrase in an answer is not', () => {
    expect(
      looksLikeLessonPlan('That is **really** a fair question about the 50 min period.', { boldSteps: true })
    ).toBe(false);
  });
});

describe("swapping the class starter (Brian's run 2, E1)", () => {
  test('a reply with a class starter offers the swap, in the app\'s words', () => {
    const chips = withStandardSuggestions(['Swap the starter for another one', 'Keep going'], {
      isOpeningReply: false,
      offerStarterSwap: true,
    });
    expect(chips).toEqual(['Keep going', SWAP_STARTER_SUGGESTION]);
  });

  test('knows a swap request when it sees one', () => {
    expect(asksToSwapStarter(SWAP_STARTER_SUGGESTION)).toBe(true);
    expect(asksToSwapStarter('Can you give me a different warm-up?')).toBe(true);
    expect(asksToSwapStarter('Build the slide deck from my stack')).toBe(false);
  });
});

describe('asksForDeck', () => {
  test('a request to build or rebuild the deck', () => {
    expect(asksForDeck('Build the slide deck from my stack')).toBe(true);
    expect(asksForDeck('Rebuild the slide deck from my stack, replacing the one in it')).toBe(true);
    expect(asksForDeck('make me slides for this')).toBe(true);
  });
  test('anything else', () => {
    expect(asksForDeck('Build the student handout from my stack')).toBe(false);
    expect(asksForDeck('What does slide 3 say?')).toBe(false);
  });
});
