import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_AIM_LINE,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_SIMPLIFIED_CHECK_OPTIONS,
  EXIT_TICKET_SIMPLIFIED_CHECK_PLACEHOLDERS,
  EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT,
  EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT,
  EXIT_TICKET_SIMPLIFIED_PROMPT_VERSION,
  composeExitTicketPrompt,
  emptyExitTicketRevisedDraft,
  exitTicketMinimumLengthLine,
  exitTicketRevisedDraftFromConfig,
  exitTicketRevisedDraftInput,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
  withExitTicketLengthLine,
  type ExitTicketConfig,
  type ExitTicketConfigInput,
} from './exit-ticket';

function simplified(input: ExitTicketConfigInput): ExitTicketConfigInput {
  return {
    promptVersion: String(EXIT_TICKET_SIMPLIFIED_PROMPT_VERSION),
    ...input,
  };
}

function parse(input: ExitTicketConfigInput): ExitTicketConfig {
  const result = parseExitTicketConfigInput(simplified(input));
  if (!result.success) throw new Error(result.message);
  return result.config;
}

function message(input: ExitTicketConfigInput): string {
  const result = parseExitTicketConfigInput(simplified(input));
  if (result.success) throw new Error('expected a parse failure');
  return result.message;
}

const roundTrip = (config: ExitTicketConfig) =>
  parseStoredExitTicketConfig(JSON.parse(JSON.stringify(config)));

describe('simplified exit ticket (Brian, 2026-11-24): stock prompts', () => {
  test('What I learned is Brian’s Nov 25 text, ending with the aim line', () => {
    expect(EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT).toBe(
      'What did you learn today? Don’t just name the topic. Tell me what you understand now that you didn’t know at the start of class. Might be a term or a way of seeing things about our topic. If you have a question you couldn’t ask in class, ask it here so I can answer it for you. Keep it conversational and don’t worry too much about polish. (Aim for a few sentences.)'
    );
  });

  test('Most interesting is Brian’s Nov 25 text, ending with the aim line', () => {
    expect(EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT).toBe(
      'What did you find most interesting from today’s lesson? Explain what it was and why it stuck with you. If nothing stood out, or you have a question you couldn’t ask in class, ask it here so I can answer it for you. Keep it conversational and don’t worry too much about polish. (Aim for a few sentences.)'
    );
  });

  test('no em dashes anywhere students or teachers read', () => {
    const copy = [
      EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT,
      EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT,
      ...Object.values(EXIT_TICKET_SIMPLIFIED_CHECK_PLACEHOLDERS).flatMap(
        (byAnswer) => [byAnswer.yes, byAnswer.no].flatMap(Object.values)
      ),
    ];
    for (const text of copy) expect(text).not.toContain('—');
  });

  test('check options are Explain a concept, Understand a text or source, Write your own', () => {
    expect(EXIT_TICKET_SIMPLIFIED_CHECK_OPTIONS.map((o) => o.label)).toEqual([
      'Explain a concept',
      'Understand a text or source',
      'Write your own',
    ]);
  });

  test('the Gatsby placeholders follow the yes/no answer', () => {
    const text = EXIT_TICKET_SIMPLIFIED_CHECK_PLACEHOLDERS['understand-text'];
    expect(text.yes.prompt).toBe(
      'e.g., What does Nick say Gatsby sprang from?'
    );
    expect(text.yes.answer).toBe('His Platonic conception of himself');
    expect(text.no.prompt).toContain('sprang from his Platonic conception');
  });
});

describe('the length line', () => {
  test('reads sentences, words, or both, and one is singular', () => {
    expect(exitTicketMinimumLengthLine({ minSentences: 3 })).toBe(
      '(Write at least 3 sentences.)'
    );
    expect(exitTicketMinimumLengthLine({ minWords: 50 })).toBe(
      '(Write at least 50 words.)'
    );
    expect(exitTicketMinimumLengthLine({ minSentences: 3, minWords: 50 })).toBe(
      '(Write at least 3 sentences and 50 words.)'
    );
    expect(exitTicketMinimumLengthLine({ minSentences: 1 })).toBe(
      '(Write at least 1 sentence.)'
    );
    expect(exitTicketMinimumLengthLine({})).toBeNull();
  });

  test('a minimum replaces the aim line', () => {
    expect(
      withExitTicketLengthLine(EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT, {
        minSentences: 3,
      })
    ).toBe(
      EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT.replace(
        EXIT_TICKET_AIM_LINE,
        '(Write at least 3 sentences.)'
      )
    );
  });

  test('a prompt without a length line gets one added at the end', () => {
    expect(
      withExitTicketLengthLine('What is an unreliable narrator?', {
        minWords: 50,
      })
    ).toBe('What is an unreliable narrator? (Write at least 50 words.)');
  });

  test('changing the minimum replaces the old one; running it twice changes nothing', () => {
    const once = withExitTicketLengthLine('Why?', { minSentences: 3 });
    const changed = withExitTicketLengthLine(once, { minWords: 20 });
    expect(changed).toBe('Why? (Write at least 20 words.)');
    expect(withExitTicketLengthLine(changed, { minWords: 20 })).toBe(changed);
  });

  test('clearing the minimum puts the aim line back on a preset only', () => {
    const withMin = withExitTicketLengthLine(
      EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT,
      { minSentences: 2 }
    );
    expect(
      withExitTicketLengthLine(withMin, null, { aimWhenNoMinimum: true })
    ).toBe(EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT);
    expect(
      withExitTicketLengthLine('Why? (Write at least 2 sentences.)', null)
    ).toBe('Why?');
  });
});

describe('simplified exit ticket: reflection', () => {
  test('students see the Prompt box exactly, teacher edits included', () => {
    const edited = EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT.replace(
      'today',
      'this week'
    );
    const config = parse({ kind: 'reflection', promptText: edited });
    expect(composeExitTicketPrompt(config)).toBe(edited);
  });

  test('graded on completion, with an optional minimum in words and sentences', () => {
    const config = parse({
      kind: 'reflection',
      promptText: EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT,
      graded: true,
      minSentences: '3',
      minWords: '50',
    });
    expect(config.grading).toEqual({
      basis: 'completion',
      minSentences: 3,
      minWords: 50,
    });
    expect(composeExitTicketPrompt(config)).toBe(
      EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT.replace(
        EXIT_TICKET_AIM_LINE,
        '(Write at least 3 sentences and 50 words.)'
      )
    );
  });

  test('a posted length line is never doubled', () => {
    const shown = withExitTicketLengthLine(
      EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT,
      { minSentences: 3 }
    );
    const config = parse({
      kind: 'reflection',
      promptText: shown,
      graded: true,
      minSentences: '3',
    });
    expect(composeExitTicketPrompt(config)).toBe(shown);
  });

  test('ungraded keeps no minimum, even if one was posted', () => {
    const config = parse({
      kind: 'reflection',
      promptText: 'What surprised you?',
      minSentences: '3',
    });
    expect(config.grading).toBeUndefined();
    expect(composeExitTicketPrompt(config)).toBe('What surprised you?');
  });

  test('Write your own needs a prompt; Still wondering is gone', () => {
    expect(
      message({
        kind: 'reflection',
        reflectionPrompt: 'custom',
        promptText: ' ',
      })
    ).toBe('Write the prompt students will answer.');
    expect(
      message({
        kind: 'reflection',
        reflectionPrompt: 'wondering',
        promptText: 'x',
      })
    ).toBe('Choose a reflection prompt.');
  });

  test('stores the marker and the reflection id older readers use', () => {
    const config = parse({
      kind: 'reflection',
      reflectionPrompt: 'custom',
      promptText: 'What did you relate to in today’s chapter?',
    });
    expect(config).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      promptVersion: EXIT_TICKET_SIMPLIFIED_PROMPT_VERSION,
      mode: 'basic',
      kind: 'reflection',
      promptText: 'What did you relate to in today’s chapter?',
      reflectionPrompt: {
        id: 'custom',
        text: 'What did you relate to in today’s chapter?',
      },
    });
    expect(roundTrip(config)).toEqual(config);
  });
});

describe('simplified exit ticket: check for understanding', () => {
  const question = 'What does Nick say Gatsby sprang from?';

  test('single correct answer: the answer is required and stored as the key', () => {
    expect(
      message({
        kind: 'check',
        focus: 'understand-text',
        promptText: question,
        singleCorrectAnswer: 'yes',
      })
    ).toBe('Enter the correct answer.');
    const config = parse({
      kind: 'check',
      focus: 'understand-text',
      promptText: question,
      singleCorrectAnswer: 'yes',
      correctAnswer: 'His Platonic conception of himself',
    });
    expect(config).toMatchObject({
      mode: 'specific',
      kind: 'check',
      focus: 'understand-text',
      checkPreset: 'understand-text',
      singleCorrectAnswer: true,
      answerType: 'objective',
      correctAnswer: 'His Platonic conception of himself',
      lessonNotes: { mustMention: 'His Platonic conception of himself' },
    });
    expect(composeExitTicketPrompt(config)).toBe(question);
  });

  test('more than one right answer: notes are optional', () => {
    const config = parse({
      kind: 'check',
      focus: 'explain-concept',
      promptText: 'What is an unreliable narrator?',
      singleCorrectAnswer: 'no',
    });
    expect(config).toMatchObject({
      singleCorrectAnswer: false,
      answerType: 'subjective',
    });
    expect(config.correctAnswer).toBeUndefined();
    expect(roundTrip(config)).toEqual(config);
  });

  test('the yes/no answer is required', () => {
    expect(
      message({
        kind: 'check',
        focus: 'explain-concept',
        promptText: 'Why?',
        correctAnswer: 'x',
      })
    ).toBe('Say whether there is a single correct answer.');
  });

  test('Write your own reads as a concept to older readers', () => {
    const config = parse({
      kind: 'check',
      focus: 'custom',
      promptText: 'What’s the difference between ‘allegory’ and ‘symbolism’?',
      singleCorrectAnswer: 'no',
    });
    expect(config).toMatchObject({
      focus: 'explain-concept',
      checkPreset: 'custom',
    });
    expect(exitTicketRevisedDraftFromConfig(roundTrip(config)).focus).toBe(
      'custom'
    );
  });

  test('Ask a question is not a choice', () => {
    expect(
      message({
        kind: 'check',
        focus: 'ask-question',
        promptText: 'Why?',
        singleCorrectAnswer: 'no',
      })
    ).toBe('Choose what this exit ticket is checking for.');
  });

  test('a minimum on a check is added to the end of the prompt', () => {
    const config = parse({
      kind: 'check',
      focus: 'explain-concept',
      promptText: 'What is an unreliable narrator?',
      singleCorrectAnswer: 'no',
      graded: true,
      minSentences: '2',
    });
    expect(config.grading).toEqual({ basis: 'bands', minSentences: 2 });
    expect(composeExitTicketPrompt(config)).toBe(
      'What is an unreliable narrator? (Write at least 2 sentences.)'
    );
  });
});

describe('the builder draft', () => {
  test('a new ticket opens on What I learned with its text in the Prompt box', () => {
    const draft = exitTicketRevisedDraftFromConfig(null);
    expect(draft.reflectionPromptText).toBe(
      EXIT_TICKET_SIMPLIFIED_LEARNED_PROMPT
    );
    expect(draft.singleCorrectAnswer).toBe('yes');
  });

  test('posts version 3 and round-trips through the parser', () => {
    const draft = emptyExitTicketRevisedDraft({
      kind: 'check',
      focus: 'understand-text',
      promptText:
        'What does Nick say Gatsby sprang from? (Write at least 1 sentence.)',
      singleCorrectAnswer: 'yes',
      correctAnswer: 'His Platonic conception of himself',
      minSentences: '1',
    });
    const input = exitTicketRevisedDraftInput(draft, true);
    expect(input.promptVersion).toBe('3');
    const result = parseExitTicketConfigInput(input);
    if (!result.success) throw new Error(result.message);
    expect(composeExitTicketPrompt(result.config)).toBe(draft.promptText);
    expect(exitTicketRevisedDraftFromConfig(result.config)).toEqual(draft);
  });

  test('a reflection draft reopens with the minimum shown in its Prompt box', () => {
    const draft = emptyExitTicketRevisedDraft({
      reflectionPromptId: 'interesting',
      reflectionPromptText: withExitTicketLengthLine(
        EXIT_TICKET_SIMPLIFIED_INTERESTING_PROMPT,
        { minWords: 40 }
      ),
      minWords: '40',
    });
    const result = parseExitTicketConfigInput(
      exitTicketRevisedDraftInput(draft, true)
    );
    if (!result.success) throw new Error(result.message);
    expect(exitTicketRevisedDraftFromConfig(roundTrip(result.config))).toEqual(
      draft
    );
  });
});
