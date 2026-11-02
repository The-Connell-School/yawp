import { describe, expect, test } from 'bun:test';
import {
  BASIC_EXIT_TICKET_PROMPT,
  DEFAULT_EXIT_TICKET_ACTIVITY,
  EXIT_TICKET_ACTIVITY_GROUPS,
  EXIT_TICKET_ACTIVITY_OPTIONS,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_EXPLAIN_CLOSER,
  EXIT_TICKET_POLISH_CLOSER,
  EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH,
  EXIT_TICKET_STARTER_OPTIONS,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  composeExitTicketPrompt,
  exitTicketActivityKind,
  exitTicketActivityOption,
  exitTicketStarterOption,
  exitTicketV3DraftFromConfig,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
  type ExitTicketConfig,
  type ExitTicketConfigInput,
} from './exit-ticket';

const ANSWER_QUESTION =
  'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?';

function parse(input: ExitTicketConfigInput): ExitTicketConfig {
  const result = parseExitTicketConfigInput(input);
  if (!result.success) throw new Error(result.message);
  return result.config;
}

describe('the v3 activities', () => {
  test('are four, in two groups, reflection first', () => {
    expect(EXIT_TICKET_ACTIVITY_OPTIONS.map((option) => option.value)).toEqual(
      ['reflect', 'explain-concept', 'answer-question', 'engage-text']
    );
    expect(EXIT_TICKET_ACTIVITY_GROUPS.map((group) => group.kind)).toEqual([
      'reflection',
      'check',
    ]);
    expect(EXIT_TICKET_ACTIVITY_GROUPS[0]!.activities).toEqual(['reflect']);
    expect(EXIT_TICKET_ACTIVITY_GROUPS[1]!.activities).toEqual([
      'explain-concept',
      'answer-question',
      'engage-text',
    ]);
    expect(DEFAULT_EXIT_TICKET_ACTIVITY).toBe('reflect');
  });

  test('are labelled for what the students do', () => {
    expect(EXIT_TICKET_ACTIVITY_OPTIONS.map((option) => option.label)).toEqual(
      [
        'Have the students reflect or ask a question',
        'Have the students explain a concept',
        'Have the students answer a question',
        'Have the students engage with a text or source',
      ]
    );
  });

  test('every activity has a description, placeholder and grading criteria', () => {
    for (const option of EXIT_TICKET_ACTIVITY_OPTIONS) {
      expect(option.description.length).toBeGreaterThan(40);
      expect(option.placeholder.startsWith('e.g., ')).toBe(true);
      expect(option.gradingCriteria.length).toBeGreaterThan(40);
    }
  });

  test('"answer a question" is the teacher asking, not the student', () => {
    const option = exitTicketActivityOption('answer-question')!;
    expect(option.description).toMatch(/quick question about what you just taught/);
    expect(option.gradingCriteria).toMatch(/misspell/);
  });

  test('the reflection group covers what they learned, what surprised them, and what they wonder', () => {
    expect(EXIT_TICKET_ACTIVITY_GROUPS[0]!.description).toBe(
      'Students tell you what they learned, what surprised them, or what they’re still wondering.'
    );
    expect(EXIT_TICKET_STARTER_OPTIONS.map((option) => option.id)).toEqual([
      'learned',
      'surprised',
      'wondering',
    ]);
  });

  test('maps each activity to the kind it is', () => {
    expect(exitTicketActivityKind('reflect')).toBe('reflection');
    expect(exitTicketActivityKind('explain-concept')).toBe('check');
    expect(exitTicketActivityKind('answer-question')).toBe('check');
    expect(exitTicketActivityKind('engage-text')).toBe('check');
  });
});

describe('the wording rule', () => {
  test('the explain closer is Brian’s line, word for word', () => {
    expect(EXIT_TICKET_EXPLAIN_CLOSER).toBe(
      'Keep it conversational, in your words, and write as much as you can — the more you can explain your thinking, the better. Don’t worry too much about polish. This is about what you understand, not writing perfectly.'
    );
  });

  test('no v3 wording uses the phrases the team asked to drop', () => {
    const banned = [
      /someone who missed class/i,
      /not the definition you were given/i,
      /ask the real one/i,
      /afraid to ask/i,
    ];
    const texts = [
      EXIT_TICKET_EXPLAIN_CLOSER,
      EXIT_TICKET_POLISH_CLOSER,
      ...EXIT_TICKET_ACTIVITY_OPTIONS.flatMap((option) => [
        option.description,
        option.placeholder,
      ]),
      ...EXIT_TICKET_STARTER_OPTIONS.map((option) => option.prompt),
    ];
    for (const text of texts) {
      for (const pattern of banned) expect(text).not.toMatch(pattern);
    }
  });

  test('explaining a concept ends with the explain closer', () => {
    const config = parse({
      activity: 'explain-concept',
      promptText:
        'In your own words, explain how Edwards uses reason and emotion together to persuade.',
    });
    expect(composeExitTicketPrompt(config)).toBe(
      `In your own words, explain how Edwards uses reason and emotion together to persuade.\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`
    );
  });

  test('a quick question gets no push for length', () => {
    const prompt = composeExitTicketPrompt(
      parse({ activity: 'answer-question', promptText: ANSWER_QUESTION })
    );
    expect(prompt).toBe(`${ANSWER_QUESTION}\n\n${EXIT_TICKET_POLISH_CLOSER}`);
    expect(prompt).not.toMatch(/as much as you can/);
  });

  test('“still wondering” just asks the question', () => {
    const wondering = exitTicketStarterOption('wondering')!;
    const prompt = composeExitTicketPrompt(
      parse({
        activity: 'reflect',
        promptText: wondering.prompt,
        starter: 'wondering',
      })
    );
    expect(prompt).not.toMatch(/as much as you can/);
    expect(prompt.startsWith(wondering.prompt)).toBe(true);
  });

  test('“what I learned” is an own-words ticket and gets the explain closer', () => {
    const learned = exitTicketStarterOption('learned')!;
    expect(
      composeExitTicketPrompt(
        parse({
          activity: 'reflect',
          promptText: learned.prompt,
          starter: 'learned',
        })
      )
    ).toBe(`${learned.prompt}\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`);
  });

  test('a starter the teacher rewrote is the teacher’s own and gets only the polish note', () => {
    const config = parse({
      activity: 'reflect',
      promptText: 'What questions do you have about the reading?',
      starter: 'learned',
    });
    expect(config.starter).toBeUndefined();
    expect(composeExitTicketPrompt(config)).toBe(
      `What questions do you have about the reading?\n\n${EXIT_TICKET_POLISH_CLOSER}`
    );
  });
});

describe('parsing a v3 ticket', () => {
  test('requires a prompt', () => {
    const result = parseExitTicketConfigInput({
      activity: 'answer-question',
      promptText: '   ',
    });
    expect(result).toEqual({
      success: false,
      message: 'Write the prompt students will answer.',
    });
  });

  test('refuses an unknown activity', () => {
    const result = parseExitTicketConfigInput({
      activity: 'multiple-choice',
      promptText: 'Pick one.',
    });
    expect(result.success).toBe(false);
  });

  test('refuses a prompt over the limit', () => {
    const result = parseExitTicketConfigInput({
      activity: 'engage-text',
      promptText: 'x'.repeat(EXIT_TICKET_PROMPT_TEXT_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  test('refuses a kind or mode that disagrees with the activity', () => {
    expect(
      parseExitTicketConfigInput({
        activity: 'reflect',
        kind: 'check',
        promptText: 'What stuck?',
      }).success
    ).toBe(false);
    expect(
      parseExitTicketConfigInput({
        activity: 'answer-question',
        mode: 'basic',
        promptText: ANSWER_QUESTION,
      }).success
    ).toBe(false);
  });

  test('keeps line breaks, so several questions about a text stay several', () => {
    const config = parse({
      activity: 'engage-text',
      promptText:
        '  Reread the second stanza.\n\n\n\n1. Find two examples of enjambment.   \n2. What does each do?  ',
    });
    expect(config.promptText).toBe(
      'Reread the second stanza.\n\n1. Find two examples of enjambment.\n2. What does each do?'
    );
  });

  test('a reflection dual-writes as a custom reflection the quick builder can read', () => {
    const config = parse({
      activity: 'reflect',
      promptText: 'What surprised you?',
    });
    expect(config).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
      kind: 'reflection',
      activity: 'reflect',
      promptText: 'What surprised you?',
      reflectionPrompt: { id: 'custom', text: 'What surprised you?' },
    });
  });

  test('a check dual-writes the legacy focus, a topic, and no fixed right answer', () => {
    const config = parse({
      activity: 'answer-question',
      promptText: ANSWER_QUESTION,
      lessonMustMention: 'Allie is his younger brother, who died of leukemia.',
    });
    expect(config).toMatchObject({
      mode: 'specific',
      kind: 'check',
      activity: 'answer-question',
      focus: 'explain-concept',
      answerType: 'subjective',
      lessonNotes: {
        mustMention: 'Allie is his younger brother, who died of leukemia.',
      },
    });
    if (config.mode !== 'specific') throw new Error('expected a check');
    expect(config.topic.length).toBeLessThanOrEqual(EXIT_TICKET_TOPIC_MAX_LENGTH);
    expect(config.topic).not.toBe('');
  });

  test('engaging with a text maps to the legacy text focus', () => {
    expect(
      parse({ activity: 'engage-text', promptText: 'Find the volta.' })
    ).toMatchObject({ focus: 'understand-text' });
  });

  test('a long prompt still writes a legacy topic inside its limit', () => {
    const config = parse({
      activity: 'explain-concept',
      promptText: `Explain ${'the causes of the war '.repeat(30)}`,
    });
    if (config.mode !== 'specific') throw new Error('expected a check');
    expect(config.topic.length).toBeLessThanOrEqual(EXIT_TICKET_TOPIC_MAX_LENGTH);
  });
});

describe('grading a v3 ticket', () => {
  test('any activity can be graded for completion', () => {
    const config = parse({
      activity: 'answer-question',
      promptText: ANSWER_QUESTION,
      graded: true,
      gradingBasis: 'completion',
    });
    expect(config.grading).toEqual({ basis: 'completion' });
  });

  test('understanding needs nothing beyond the prompt', () => {
    const config = parse({
      activity: 'reflect',
      promptText: 'What did you learn?',
      graded: true,
      gradingBasis: 'bands',
    });
    expect(config.grading).toEqual({ basis: 'bands' });
  });

  test('a graded ticket must say how it is graded', () => {
    const result = parseExitTicketConfigInput({
      activity: 'explain-concept',
      promptText: 'Explain irony.',
      graded: true,
    });
    expect(result).toEqual({
      success: false,
      message: 'Choose how this ticket is graded.',
    });
  });

  test('an ungraded ticket stores no grading', () => {
    expect(
      parse({ activity: 'reflect', promptText: 'What stuck?', graded: false })
        .grading
    ).toBeUndefined();
  });
});

describe('reading a stored v3 ticket', () => {
  test('round-trips through storage and composes the same prompt', () => {
    const config = parse({
      activity: 'reflect',
      promptText: exitTicketStarterOption('learned')!.prompt,
      starter: 'learned',
      graded: true,
      gradingBasis: 'completion',
    });
    const stored = parseStoredExitTicketConfig(
      JSON.parse(JSON.stringify(config))
    );
    expect(stored).toEqual(config);
    expect(composeExitTicketPrompt(stored!)).toBe(
      composeExitTicketPrompt(config)
    );
  });

  test('drops v3 fields that disagree with the mode, keeping the legacy ticket', () => {
    const stored = parseStoredExitTicketConfig({
      schemaVersion: 1,
      mode: 'basic',
      activity: 'answer-question',
      promptText: 'Who is Allie?',
    });
    expect(stored).toEqual({ schemaVersion: 1, mode: 'basic' });
  });

  test('a reader that ignores the v3 keys still has a valid ticket', () => {
    const config = parse({
      activity: 'answer-question',
      promptText: ANSWER_QUESTION,
    });
    const { activity, promptText, starter, ...legacy } = config;
    void activity;
    void promptText;
    void starter;
    expect(parseStoredExitTicketConfig(legacy)).not.toBeNull();
  });

  test('legacy rows are untouched', () => {
    const legacy = { schemaVersion: 1, mode: 'basic' };
    expect(parseStoredExitTicketConfig(legacy)).toEqual({
      schemaVersion: 1,
      mode: 'basic',
    });
    expect(composeExitTicketPrompt({ schemaVersion: 1, mode: 'basic' })).toMatch(
      BASIC_EXIT_TICKET_PROMPT
    );
  });
});

describe('opening any ticket in the v3 builder', () => {
  test('a new ticket starts on “what I learned”', () => {
    expect(exitTicketV3DraftFromConfig(null)).toEqual({
      activity: 'reflect',
      promptText: exitTicketStarterOption('learned')!.prompt,
      starter: 'learned',
    });
  });

  test('a v3 ticket reopens as written', () => {
    const config = parse({
      activity: 'answer-question',
      promptText: ANSWER_QUESTION,
    });
    expect(exitTicketV3DraftFromConfig(config)).toEqual({
      activity: 'answer-question',
      promptText: ANSWER_QUESTION,
      starter: null,
    });
  });

  test('a legacy “still wondering” reflection reopens on the wondering starter', () => {
    expect(
      exitTicketV3DraftFromConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'wondering' },
      })
    ).toEqual({
      activity: 'reflect',
      promptText: exitTicketStarterOption('wondering')!.prompt,
      starter: 'wondering',
    });
  });

  test('a legacy custom reflection keeps the teacher’s question', () => {
    expect(
      exitTicketV3DraftFromConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'custom', text: 'What would you teach a friend?' },
      })
    ).toEqual({
      activity: 'reflect',
      promptText: 'What would you teach a friend?',
      starter: null,
    });
  });

  test('a legacy check becomes the matching activity, without the dropped phrasing', () => {
    const explain = exitTicketV3DraftFromConfig({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'weathering and erosion.',
      answerType: 'objective',
    });
    expect(explain).toEqual({
      activity: 'explain-concept',
      promptText: 'In your own words, explain weathering and erosion.',
      starter: null,
    });

    const asked = exitTicketV3DraftFromConfig({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'ask-question',
      topic: 'semicolons',
      answerType: 'subjective',
    });
    expect(asked.activity).toBe('reflect');
    expect(asked.promptText).toBe(
      'What is one question you still have about semicolons?'
    );

    const text = exitTicketV3DraftFromConfig({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic: 'the second stanza',
      answerType: 'subjective',
    });
    expect(text.activity).toBe('engage-text');
    expect(text.promptText).toMatch(/the second stanza/);
    expect(text.promptText).not.toMatch(/someone who missed class/);
  });
});
