import { describe, expect, test } from 'bun:test';
import {
  BASIC_EXIT_TICKET_PROMPT,
  DEFAULT_EXIT_TICKET_ACTIVITY,
  EXIT_TICKET_ACTIVITY_OPTIONS,
  EXIT_TICKET_CHOICE_GROUPS,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_EXPLAIN_CLOSER,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_STARTER_OPTIONS,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  composeExitTicketPrompt,
  emptyExitTicketV3Draft,
  exitTicketActivityKind,
  exitTicketChoiceFor,
  exitTicketStarterOption,
  exitTicketV3DraftFromConfig,
  exitTicketV3DraftInput,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
  type ExitTicketConfig,
  type ExitTicketConfigInput,
  type ExitTicketV3Draft,
} from './exit-ticket';

const ANSWER_QUESTION =
  'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?';

function parse(input: ExitTicketConfigInput): ExitTicketConfig {
  const result = parseExitTicketConfigInput(input);
  if (!result.success) throw new Error(result.message);
  return result.config;
}

function parseDraft(patch: Partial<ExitTicketV3Draft>): ExitTicketConfig {
  return parse(exitTicketV3DraftInput(emptyExitTicketV3Draft(patch)));
}

describe('what students can do', () => {
  test('reflections first, then checks for understanding', () => {
    expect(
      EXIT_TICKET_CHOICE_GROUPS.map((group) => [
        group.label,
        group.choices.map((choice) => choice.label),
      ])
    ).toEqual([
      [
        'Reflection',
        [
          'What I learned',
          'Most interesting',
          'Still wondering',
          'Write your own question',
        ],
      ],
      [
        'Check for understanding',
        [
          'Explain a concept in their own words',
          'Answer a question',
          'Grapple with a text or source',
        ],
      ],
    ]);
  });

  test('every choice maps back to one activity and reflection', () => {
    expect(exitTicketChoiceFor('reflect', 'learned')).toBe('reflect:learned');
    expect(exitTicketChoiceFor('reflect', null)).toBe('reflect:custom');
    expect(exitTicketChoiceFor('engage-text', null)).toBe('engage-text');
    expect(DEFAULT_EXIT_TICKET_ACTIVITY).toBe('reflect');
  });

  test('maps each activity to the kind it is', () => {
    expect(exitTicketActivityKind('reflect')).toBe('reflection');
    expect(exitTicketActivityKind('explain-concept')).toBe('check');
    expect(exitTicketActivityKind('answer-question')).toBe('check');
    expect(exitTicketActivityKind('engage-text')).toBe('check');
  });
});

describe('the wording students see', () => {
  const studentText = [
    EXIT_TICKET_EXPLAIN_CLOSER,
    ...EXIT_TICKET_STARTER_OPTIONS.map((option) => option.prompt),
  ];

  test('is short and plain', () => {
    for (const text of studentText) {
      expect(text).not.toContain('—');
      expect(text.length).toBeLessThan(70);
    }
  });

  test('drops the phrases the team asked to cut', () => {
    const all = studentText.join(' ').toLowerCase();
    for (const phrase of [
      'someone who missed class',
      'not the definition you were given',
      'the real one',
      'the more you',
      'this is about what you understand',
      'be honest',
    ]) {
      expect(all).not.toContain(phrase);
    }
  });

  test('“what I learned” ends with the one closing line', () => {
    expect(composeExitTicketPrompt(parseDraft({ starter: 'learned' }))).toBe(
      `What did you learn today? Explain it in your own words.\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`
    );
  });

  test('“most interesting” and “still wondering” just ask', () => {
    expect(
      composeExitTicketPrompt(parseDraft({ starter: 'interesting' }))
    ).toBe('What was the most interesting part of today’s lesson? Why?');
    expect(composeExitTicketPrompt(parseDraft({ starter: 'wondering' }))).toBe(
      'What is one question you still have about today’s lesson?'
    );
  });

  test('a teacher’s own question is exactly what students see', () => {
    expect(
      composeExitTicketPrompt(
        parseDraft({ starter: null, promptText: 'What will you try tomorrow?' })
      )
    ).toBe('What will you try tomorrow?');
  });

  test('“explain a concept” builds the sentence from the concept', () => {
    expect(
      composeExitTicketPrompt(
        parseDraft({
          activity: 'explain-concept',
          starter: null,
          topic: '  how Edwards uses reason and emotion together. ',
        })
      )
    ).toBe(
      `In your own words, explain how Edwards uses reason and emotion together.\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`
    );
  });

  test('a question and a text task get no closing line', () => {
    expect(
      composeExitTicketPrompt(
        parseDraft({
          activity: 'answer-question',
          starter: null,
          promptText: ANSWER_QUESTION,
        })
      )
    ).toBe(ANSWER_QUESTION);
    expect(
      composeExitTicketPrompt(
        parseDraft({
          activity: 'engage-text',
          starter: null,
          promptText: 'Reread stanza two.\n1. What is the speaker saying?',
        })
      )
    ).toBe('Reread stanza two.\n1. What is the speaker saying?');
  });
});

describe('parsing a v3 ticket', () => {
  test('a fixed reflection needs nothing typed', () => {
    const config = parse({ activity: 'reflect', starter: 'wondering' });
    expect(config).toMatchObject({
      mode: 'basic',
      activity: 'reflect',
      starter: 'wondering',
      promptText: exitTicketStarterOption('wondering')!.prompt,
      reflectionPrompt: { id: 'wondering' },
    });
  });

  test('“what I learned” writes no legacy reflection, like the quick builder', () => {
    const config = parse({ activity: 'reflect', starter: 'learned' });
    expect(config.mode === 'basic' && config.reflectionPrompt).toBeFalsy();
  });

  test('a teacher’s own question dual-writes as a custom reflection', () => {
    expect(
      parse({ activity: 'reflect', promptText: 'What will you try?' })
    ).toMatchObject({
      mode: 'basic',
      kind: 'reflection',
      promptText: 'What will you try?',
      reflectionPrompt: { id: 'custom', text: 'What will you try?' },
    });
  });

  test('an edited fixed prompt is the teacher’s own', () => {
    const config = parse({
      activity: 'reflect',
      starter: 'learned',
      promptText: 'What did you learn about semicolons?',
    });
    expect(config.starter).toBeUndefined();
    expect(config.mode === 'basic' && config.reflectionPrompt).toEqual({
      id: 'custom',
      text: 'What did you learn about semicolons?',
    });
  });

  test('says what is missing', () => {
    expect(parseExitTicketConfigInput({ activity: 'reflect' })).toEqual({
      success: false,
      message: 'Write the question students will answer.',
    });
    expect(
      parseExitTicketConfigInput({ activity: 'explain-concept' })
    ).toEqual({
      success: false,
      message: 'Name the concept students will explain.',
    });
    expect(
      parseExitTicketConfigInput({ activity: 'answer-question', promptText: ' ' })
    ).toEqual({
      success: false,
      message: 'Write the prompt students will answer.',
    });
    expect(parseExitTicketConfigInput({ activity: 'quiz' })).toEqual({
      success: false,
      message: 'Choose what students will do.',
    });
  });

  test('refuses text over the limits', () => {
    expect(
      parseExitTicketConfigInput({
        activity: 'answer-question',
        promptText: 'x'.repeat(EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH + 1),
      }).success
    ).toBe(false);
    expect(
      parseExitTicketConfigInput({
        activity: 'explain-concept',
        topic: 'x'.repeat(EXIT_TICKET_TOPIC_MAX_LENGTH + 1),
      }).success
    ).toBe(false);
  });

  test('refuses a kind or mode that disagrees with the activity', () => {
    expect(
      parseExitTicketConfigInput({
        activity: 'answer-question',
        promptText: ANSWER_QUESTION,
        kind: 'reflection',
      })
    ).toEqual({ success: false, message: 'Exit ticket type is invalid.' });
  });

  test('“explain a concept” stores the concept as the legacy topic', () => {
    expect(
      parse({ activity: 'explain-concept', topic: 'a theme vs. a topic' })
    ).toMatchObject({
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'a theme vs. a topic',
      promptText: 'In your own words, explain a theme vs. a topic.',
    });
  });

  test('“explain a concept” with a written question and no concept is a question', () => {
    expect(
      parse({ activity: 'explain-concept', promptText: ANSWER_QUESTION })
    ).toMatchObject({ activity: 'answer-question', promptText: ANSWER_QUESTION });
  });

  test('a check has no correct answer unless the teacher says so', () => {
    expect(
      parse({ activity: 'answer-question', promptText: ANSWER_QUESTION })
    ).toMatchObject({ answerType: 'subjective' });
    expect(
      parse({
        activity: 'answer-question',
        promptText: ANSWER_QUESTION,
        answerType: 'objective',
        lessonMustMention: 'His younger brother, who died.',
      })
    ).toMatchObject({
      answerType: 'objective',
      lessonNotes: { mustMention: 'His younger brother, who died.' },
    });
  });

  test('a correct answer given without saying so means there is one', () => {
    expect(
      parse({
        activity: 'answer-question',
        promptText: ANSWER_QUESTION,
        lessonMustMention: 'His younger brother.',
      })
    ).toMatchObject({ answerType: 'objective' });
  });

  test('a correct answer can be left blank', () => {
    expect(
      parse({
        activity: 'answer-question',
        promptText: ANSWER_QUESTION,
        answerType: 'objective',
      })
    ).toMatchObject({ answerType: 'objective' });
  });

  test('grapple with a text maps to the legacy text focus', () => {
    expect(
      parse({ activity: 'engage-text', promptText: 'Reread stanza two.' })
    ).toMatchObject({ focus: 'understand-text' });
  });

  test('a long prompt still writes a legacy topic inside its limit', () => {
    const config = parse({
      activity: 'engage-text',
      promptText: 'Reread the passage. '.repeat(40),
    });
    expect(
      config.mode === 'specific' && config.topic.length
    ).toBeLessThanOrEqual(EXIT_TICKET_TOPIC_MAX_LENGTH);
  });

  test('nothing new is graded, but an edited graded ticket keeps its grade', () => {
    expect(parse({ activity: 'reflect', starter: 'learned' }).grading).toBe(
      undefined
    );
    expect(
      parse({ activity: 'reflect', starter: 'learned', graded: true }).grading
    ).toEqual({ basis: 'completion' });
    expect(
      parse({
        activity: 'reflect',
        starter: 'learned',
        graded: true,
        gradingBasis: 'bands',
      }).grading
    ).toEqual({ basis: 'bands' });
  });
});

describe('reading a stored v3 ticket', () => {
  test('round-trips through storage and composes the same prompt', () => {
    for (const patch of [
      { starter: 'interesting' as const },
      { starter: null, promptText: 'What will you try?' },
      { activity: 'explain-concept' as const, starter: null, topic: 'irony' },
      {
        activity: 'answer-question' as const,
        starter: null,
        promptText: ANSWER_QUESTION,
        answerType: 'objective' as const,
      },
    ]) {
      const config = parseDraft(patch);
      const stored = parseStoredExitTicketConfig(
        JSON.parse(JSON.stringify(config))
      );
      expect(stored).toEqual(config);
      expect(composeExitTicketPrompt(stored!)).toBe(
        composeExitTicketPrompt(config)
      );
    }
  });

  test('a reader that ignores the v3 keys still has a valid ticket', () => {
    const config = parseDraft({ starter: 'wondering' }) as Record<
      string,
      unknown
    >;
    const { activity, promptText, starter, ...legacy } = config;
    void activity;
    void promptText;
    void starter;
    expect(parseStoredExitTicketConfig(legacy)).toMatchObject({
      mode: 'basic',
      reflectionPrompt: { id: 'wondering' },
    });
  });

  test('legacy rows are untouched', () => {
    const legacy = {
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    };
    expect(composeExitTicketPrompt(parseStoredExitTicketConfig(legacy)!)).toContain(
      BASIC_EXIT_TICKET_PROMPT
    );
  });
});

describe('opening any ticket in the v3 builder', () => {
  test('a new ticket starts on “what I learned”', () => {
    expect(exitTicketV3DraftFromConfig(null)).toEqual(emptyExitTicketV3Draft());
    expect(emptyExitTicketV3Draft()).toMatchObject({
      activity: 'reflect',
      starter: 'learned',
    });
  });

  test('a v3 ticket reopens on the same choice', () => {
    for (const patch of [
      { starter: 'interesting' as const },
      { starter: null, promptText: 'What will you try?' },
      { activity: 'explain-concept' as const, starter: null, topic: 'irony' },
      {
        activity: 'engage-text' as const,
        starter: null,
        promptText: 'Reread stanza two.',
        answerType: 'objective' as const,
      },
    ]) {
      expect(exitTicketV3DraftFromConfig(parseDraft(patch))).toEqual(
        emptyExitTicketV3Draft(patch)
      );
    }
  });

  test('legacy reflections reopen on the matching choice', () => {
    for (const id of ['interesting', 'wondering'] as const) {
      expect(
        exitTicketV3DraftFromConfig({
          schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
          mode: 'basic',
          reflectionPrompt: { id },
        })
      ).toEqual(emptyExitTicketV3Draft({ starter: id }));
    }
    expect(
      exitTicketV3DraftFromConfig({
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
        reflectionPrompt: { id: 'custom', text: 'What clicked?' },
      })
    ).toEqual(emptyExitTicketV3Draft({ starter: null, promptText: 'What clicked?' }));
  });

  test('a legacy “explain a concept” check keeps its concept and answer type', () => {
    expect(
      exitTicketV3DraftFromConfig({
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        focus: 'explain-concept',
        topic: 'irony',
        answerType: 'objective',
      })
    ).toEqual(
      emptyExitTicketV3Draft({
        activity: 'explain-concept',
        starter: null,
        topic: 'irony',
        answerType: 'objective',
      })
    );
  });

  test('a legacy text check opens as grappling with the text', () => {
    expect(
      exitTicketV3DraftFromConfig({
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        focus: 'understand-text',
        topic: 'the second stanza',
        answerType: 'subjective',
      })
    ).toMatchObject({
      activity: 'engage-text',
      promptText: 'What is the second stanza saying? Point to the part that shows it.',
    });
  });

  test('every activity option is reachable from the form', () => {
    const reachable = new Set(
      EXIT_TICKET_CHOICE_GROUPS.flatMap((group) =>
        group.choices.map((choice) => choice.value.split(':')[0])
      )
    );
    for (const option of EXIT_TICKET_ACTIVITY_OPTIONS) {
      expect(reachable.has(option.value)).toBe(true);
    }
  });
});
