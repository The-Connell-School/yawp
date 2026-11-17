import { describe, expect, test } from 'bun:test';
import {
  BASIC_EXIT_TICKET_PROMPT,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  EXIT_TICKET_ELABORATION_NOTE,
  EXIT_TICKET_IDEAS_NOTE,
  EXIT_TICKET_REFLECTION_QUESTION_LINE,
  EXIT_TICKET_REVISED_DEFAULT_POINT_VALUE,
  EXIT_TICKET_REVISED_FOCUS_OPTIONS,
  EXIT_TICKET_REVISED_PROMPT_VERSION,
  EXIT_TICKET_REVISED_REFLECTION_OPTIONS,
  composeExitTicketPrompt,
  exitTicketRevisedDraftFromConfig,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
  type ExitTicketConfig,
  type ExitTicketConfigInput,
} from './exit-ticket';

const QUESTION =
  'Look at the first page of The Catcher in the Rye. Quote one line that shows Holden is an unreliable narrator, and explain how it shows that.';
const KEY =
  'A direct quote from page one; Holden exaggerates, contradicts himself, or admits he lies.';

function revised(input: ExitTicketConfigInput): ExitTicketConfigInput {
  return { promptVersion: String(EXIT_TICKET_REVISED_PROMPT_VERSION), ...input };
}

function parse(input: ExitTicketConfigInput): ExitTicketConfig {
  const result = parseExitTicketConfigInput(revised(input));
  if (!result.success) throw new Error(result.message);
  return result.config;
}

function message(input: ExitTicketConfigInput): string {
  const result = parseExitTicketConfigInput(revised(input));
  if (result.success) throw new Error('expected a parse failure');
  return result.message;
}

describe('revised exit ticket (Brian, 2026-11-17): reflection', () => {
  test('offers What I learned, Most interesting and Write your own only', () => {
    expect(EXIT_TICKET_REVISED_REFLECTION_OPTIONS.map((o) => o.label)).toEqual(
      ['What I learned', 'Most interesting', 'Write your own']
    );
  });

  test('What I learned asks the new question, invites a question, and ends with the ideas note', () => {
    const config = parse({ kind: 'reflection' });
    expect(composeExitTicketPrompt(config)).toBe(
      [
        'Tell me in your own words what you learned today. Don’t just name the topic — explain what you understand now that you didn’t understand at the start of class.',
        'Still have a question about today’s lesson? Ask it here too.',
        'Ideas matter more than grammar or polish.',
      ].join('\n\n')
    );
  });

  test('Most interesting invites a question too', () => {
    const config = parse({ kind: 'reflection', reflectionPrompt: 'interesting' });
    expect(composeExitTicketPrompt(config)).toBe(
      [
        'What was the most interesting thing from today’s lesson? Explain what it was and why it stuck with you.',
        EXIT_TICKET_REFLECTION_QUESTION_LINE,
        EXIT_TICKET_IDEAS_NOTE,
      ].join('\n\n')
    );
  });

  test('Write your own is the teacher’s question and the ideas note, nothing else', () => {
    const config = parse({
      kind: 'reflection',
      reflectionPrompt: 'custom',
      reflectionPromptText: '  What would you tell a friend who missed today? ',
    });
    expect(composeExitTicketPrompt(config)).toBe(
      `What would you tell a friend who missed today?\n\n${EXIT_TICKET_IDEAS_NOTE}`
    );
  });

  test('Write your own needs a question', () => {
    expect(
      message({ kind: 'reflection', reflectionPrompt: 'custom' })
    ).toBe('Write the question students will answer.');
  });

  test('Still wondering is not a choice anymore', () => {
    expect(
      message({ kind: 'reflection', reflectionPrompt: 'wondering' })
    ).toBe('Choose a reflection prompt.');
  });

  test('a graded reflection is completion only: no minimum length, no criteria', () => {
    const config = parse({
      kind: 'reflection',
      graded: true,
      gradingBasis: 'bands',
      minWords: '40',
      minSentences: '3',
      assessFor: 'Depth',
      lessonMainPoints: 'Puritans',
    });
    expect(config.grading).toEqual({ basis: 'completion' });
    expect(config.lessonNotes).toBeUndefined();
    expect(composeExitTicketPrompt(config)).not.toContain('Write at least');
  });

  test('an ungraded reflection stores no grading', () => {
    expect(parse({ kind: 'reflection' }).grading).toBeUndefined();
  });

  test('stores the version marker and the legacy shape older readers need', () => {
    expect(parse({ kind: 'reflection', reflectionPrompt: 'interesting' })).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      promptVersion: EXIT_TICKET_REVISED_PROMPT_VERSION,
      mode: 'basic',
      kind: 'reflection',
      reflectionPrompt: { id: 'interesting' },
    });
  });
});

describe('revised exit ticket (Brian, 2026-11-17): check for understanding', () => {
  test('checks for Explain a concept or Understand a text or source, with the old helpers', () => {
    expect(
      EXIT_TICKET_REVISED_FOCUS_OPTIONS.map((o) => [o.value, o.label, o.helperText])
    ).toEqual([
      [
        'explain-concept',
        'Explain a concept',
        'Can they put the idea in their own words instead of repeating yours?',
      ],
      [
        'understand-text',
        'Understand a text or source',
        'Did they read it closely, or just get the gist?',
      ],
    ]);
  });

  test('students see the teacher’s whole question, never a fill-in template', () => {
    for (const focus of ['explain-concept', 'understand-text']) {
      const config = parse({
        kind: 'check',
        focus,
        promptText: QUESTION,
        correctAnswer: KEY,
      });
      expect(composeExitTicketPrompt(config)).toBe(
        `${QUESTION}\n\n${EXIT_TICKET_IDEAS_NOTE}`
      );
    }
  });

  test('a minimum length in sentences is told to students', () => {
    const config = parse({
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      graded: true,
      minSentences: '3',
    });
    expect(composeExitTicketPrompt(config)).toBe(
      `${QUESTION}\n\nWrite at least 3 sentences.\n\n${EXIT_TICKET_IDEAS_NOTE}`
    );
    expect(config.grading).toEqual({ basis: 'bands', minSentences: 3 });
  });

  test('a minimum length in words is told to students', () => {
    const config = parse({
      kind: 'check',
      focus: 'explain-concept',
      promptText: QUESTION,
      correctAnswer: KEY,
      graded: true,
      minWords: '40',
    });
    expect(composeExitTicketPrompt(config)).toContain('Write at least 40 words.');
  });

  test('a minimum of one reads as a sentence, not "1 sentences"', () => {
    const config = parse({
      kind: 'check',
      focus: 'explain-concept',
      promptText: QUESTION,
      correctAnswer: KEY,
      graded: true,
      minSentences: '1',
    });
    expect(composeExitTicketPrompt(config)).toContain('Write at least 1 sentence.');
  });

  test('a minimum is words or sentences, not both', () => {
    expect(
      message({
        kind: 'check',
        focus: 'explain-concept',
        promptText: QUESTION,
        correctAnswer: KEY,
        graded: true,
        minWords: '40',
        minSentences: '3',
      })
    ).toBe('Set a minimum in words or in sentences, not both.');
  });

  test('an ungraded check has no minimum, even if one was posted', () => {
    const config = parse({
      kind: 'check',
      focus: 'explain-concept',
      promptText: QUESTION,
      correctAnswer: KEY,
      minWords: '40',
    });
    expect(config.grading).toBeUndefined();
    expect(composeExitTicketPrompt(config)).not.toContain('Write at least');
  });

  test('the question is required', () => {
    expect(
      message({ kind: 'check', focus: 'explain-concept', correctAnswer: KEY })
    ).toBe('Write the question students will answer.');
  });

  test('the correct answer or key points are required, graded or not', () => {
    expect(
      message({ kind: 'check', focus: 'explain-concept', promptText: QUESTION })
    ).toBe('Add the correct answer or key points.');
  });

  test('Ask a question is not a choice anymore', () => {
    expect(
      message({
        kind: 'check',
        focus: 'ask-question',
        promptText: QUESTION,
        correctAnswer: KEY,
      })
    ).toBe('Choose what this exit ticket is checking for.');
  });

  test('writes what the Grading Assistant reads, and dual-writes the legacy key', () => {
    const config = parse({
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      answerType: 'subjective',
      lessonWatchFor: 'Confusing Holden with Allie',
    });
    expect(config).toMatchObject({
      promptVersion: EXIT_TICKET_REVISED_PROMPT_VERSION,
      mode: 'specific',
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      // Always a right-answer check: the teacher always gives the key.
      answerType: 'objective',
      // The legacy grader reads the key here if the flag is ever turned off.
      lessonNotes: { mainPoints: '', mustMention: KEY, watchFor: '' },
    });
    if (config.mode !== 'specific') throw new Error('expected a check');
    expect(config.topic.length).toBeGreaterThan(0);
  });

  test('round-trips through storage and composes the same prompt', () => {
    const config = parse({
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      graded: true,
      minWords: '30',
    });
    const stored = parseStoredExitTicketConfig(
      JSON.parse(JSON.stringify(config))
    );
    expect(stored).toEqual(config);
    expect(composeExitTicketPrompt(stored!)).toBe(composeExitTicketPrompt(config));
  });

  test('a reflection round-trips through storage', () => {
    const config = parse({
      kind: 'reflection',
      reflectionPrompt: 'custom',
      reflectionPromptText: 'What surprised you?',
      graded: true,
    });
    expect(
      parseStoredExitTicketConfig(JSON.parse(JSON.stringify(config)))
    ).toEqual(config);
  });
});

describe('revised exit ticket: both types', () => {
  test('defaults to 5 points', () => {
    expect(EXIT_TICKET_REVISED_DEFAULT_POINT_VALUE).toBe(5);
  });

  test('tickets without the marker compose exactly as before', () => {
    const legacy = parseExitTicketConfigInput({ kind: 'reflection' });
    if (!legacy.success) throw new Error(legacy.message);
    expect(composeExitTicketPrompt(legacy.config)).toBe(
      `${BASIC_EXIT_TICKET_PROMPT}\n\n${EXIT_TICKET_ELABORATION_NOTE}`
    );
    expect(EXIT_TICKET_DEFAULT_POINT_VALUE).toBe(10);
  });

  test('old stored configs still read: Still wondering, Ask a question, Yes/No', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'wondering' },
      })
    ).not.toBeNull();
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'specific',
        focus: 'ask-question',
        topic: 'semicolons',
        answerType: 'subjective',
      })
    ).not.toBeNull();
  });
});

describe('exitTicketRevisedDraftFromConfig', () => {
  test('a new ticket opens on What I learned and Explain a concept', () => {
    expect(exitTicketRevisedDraftFromConfig(null)).toEqual({
      kind: 'reflection',
      reflectionPromptId: 'learned',
      reflectionPromptText: '',
      focus: 'explain-concept',
      promptText: '',
      correctAnswer: '',
      minWords: '',
      minSentences: '',
    });
  });

  test('reopens a revised check as it was made', () => {
    const config = parse({
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      graded: true,
      minSentences: '2',
    });
    expect(exitTicketRevisedDraftFromConfig(config)).toMatchObject({
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      minSentences: '2',
      minWords: '',
    });
  });

  test('an old Still wondering ticket opens on What I learned', () => {
    const stored = parseStoredExitTicketConfig({
      schemaVersion: 1,
      mode: 'basic',
      reflectionPrompt: { id: 'wondering' },
    });
    expect(exitTicketRevisedDraftFromConfig(stored).reflectionPromptId).toBe(
      'learned'
    );
  });

  test('an old fill-in check opens with its sentence as the question and its key', () => {
    const stored = parseStoredExitTicketConfig({
      schemaVersion: 1,
      mode: 'specific',
      kind: 'check',
      focus: 'explain-concept',
      topic: 'how to work a quotation into your own sentence',
      answerType: 'objective',
      lessonNotes: { mainPoints: '', mustMention: 'Introduce it', watchFor: '' },
    });
    expect(exitTicketRevisedDraftFromConfig(stored)).toMatchObject({
      kind: 'check',
      focus: 'explain-concept',
      promptText:
        'In your own words, explain how to work a quotation into your own sentence.',
      correctAnswer: 'Introduce it',
    });
  });

  test('an old Ask a question check opens on Explain a concept', () => {
    const stored = parseStoredExitTicketConfig({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'ask-question',
      topic: 'semicolons',
      answerType: 'subjective',
    });
    expect(exitTicketRevisedDraftFromConfig(stored).focus).toBe(
      'explain-concept'
    );
  });
});
