import { describe, expect, test } from 'bun:test';
import {
  BASIC_EXIT_TICKET_PROMPT,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_CONFIG_SCHEMA_VERSION,
  EXIT_TICKET_ELABORATION_NOTE,
  EXIT_TICKET_FOCUS_OPTIONS,
  EXIT_TICKET_LESSON_NOTE_FIELDS,
  EXIT_TICKET_LESSON_NOTE_MAX_LENGTH,
  EXIT_TICKET_MODES,
  EXIT_TICKET_TOPIC_MAX_LENGTH,
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT,
  EXIT_TICKET_TUTOR_ENABLED_DEFAULT,
  composeExitTicketPrompt,
  defaultExitTicketLessonNotesEnabled,
  exitTicketTargetingHint,
  exitTicketFocusOption,
  isExitTicketAssignmentType,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
} from './exit-ticket';
import { DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE } from '~/domain/assignments/saved-assignments';

describe('the exit ticket assignment type', () => {
  test('is recognized by kind, not by title', () => {
    expect(EXIT_TICKET_ASSIGNMENT_TYPE_KIND).toBe('exit_ticket');
    expect(isExitTicketAssignmentType({ kind: 'exit_ticket' })).toBe(true);
    expect(isExitTicketAssignmentType({ kind: 'daily_pages' })).toBe(false);
    expect(isExitTicketAssignmentType({ kind: null })).toBe(false);
    expect(isExitTicketAssignmentType(undefined)).toBe(false);
    // A row titled "Exit Ticket" that never got the kind is still an ordinary
    // assignment type: the title is never what decides this.
    expect(isExitTicketAssignmentType({ kind: null })).toBe(false);
  });

  test('offers exactly two ways to write one', () => {
    expect(EXIT_TICKET_MODES).toEqual(['basic', 'specific']);
  });

  test('every focus option can build a sentence around a topic', () => {
    expect(EXIT_TICKET_FOCUS_OPTIONS.length).toBeGreaterThan(1);

    const values = new Set<string>();
    for (const option of EXIT_TICKET_FOCUS_OPTIONS) {
      expect(values.has(option.value)).toBe(false);
      values.add(option.value);

      expect(option.label.trim()).not.toBe('');
      expect(option.helperText.trim()).not.toBe('');
      expect(option.topicPlaceholder.trim()).not.toBe('');
      // What "explains it" means for this focus. The bands stay the shared
      // spine; this is what the grader reads them through.
      expect(option.gradingCriteria.trim()).not.toBe('');
      // The whole point of the focus is that the teacher's topic lands
      // inside a real sentence rather than being appended to one.
      expect(option.template).toInclude('{topic}');
    }
  });

  test('no two focuses are judged the same way', () => {
    // If two focuses shared criteria, one of them is not pulling its weight
    // as a distinct thing to check for.
    const criteria = EXIT_TICKET_FOCUS_OPTIONS.map(
      (option) => option.gradingCriteria
    );
    expect(new Set(criteria).size).toBe(criteria.length);
  });

  test('exitTicketFocusOption looks options up and rejects unknown ones', () => {
    const first = EXIT_TICKET_FOCUS_OPTIONS[0];
    expect(exitTicketFocusOption(first.value)).toEqual(first);
    expect(exitTicketFocusOption('not-a-focus')).toBeNull();
  });
});

describe('composeExitTicketPrompt', () => {
  test('a basic exit ticket is the same standard prompt every time', () => {
    const prompt = composeExitTicketPrompt({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });

    expect(prompt).toInclude(BASIC_EXIT_TICKET_PROMPT);
    expect(prompt).toInclude(EXIT_TICKET_ELABORATION_NOTE);
  });

  test('a specific exit ticket puts the topic inside the focus sentence', () => {
    const prompt = composeExitTicketPrompt({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'the causes of World War I',
    });

    expect(prompt).toInclude('the causes of World War I');
    expect(prompt).toInclude(EXIT_TICKET_ELABORATION_NOTE);
    expect(prompt).not.toInclude('{topic}');
    // Specific means specific: the generic "what did you learn today"
    // prompt must not be what students actually see.
    expect(prompt).not.toInclude(BASIC_EXIT_TICKET_PROMPT);
  });

  test('the teacher never has to punctuate the topic correctly', () => {
    const prompt = composeExitTicketPrompt({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific',
      focus: 'explain-concept',
      topic: '  how   photosynthesis works.  ',
    });

    expect(prompt).toInclude('how photosynthesis works.');
    expect(prompt).not.toInclude('works..');
    expect(prompt).not.toInclude('  ');
  });

  test('every focus produces a prompt that asks for writing', () => {
    for (const option of EXIT_TICKET_FOCUS_OPTIONS) {
      const prompt = composeExitTicketPrompt({
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        focus: option.value,
        topic: 'yesterday’s reading',
      });

      expect(prompt).toInclude('yesterday’s reading');
      expect(prompt).toInclude(EXIT_TICKET_ELABORATION_NOTE);
    }
  });
});

describe('parseExitTicketConfigInput', () => {
  test('treats a missing mode as a basic exit ticket', () => {
    // A form that does not render the toggle — an older client, or the
    // sheet before it knew about exit tickets — still creates something
    // usable rather than failing.
    const result = parseExitTicketConfigInput({});
    expect(result).toEqual({
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
      },
    });
  });

  test('ignores a focus and topic sent alongside basic', () => {
    const result = parseExitTicketConfigInput({
      mode: 'basic',
      focus: 'explain-concept',
      topic: 'mitosis',
    });

    expect(result).toEqual({
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic',
      },
    });
  });

  test('keeps the focus and trimmed topic for a specific exit ticket', () => {
    const result = parseExitTicketConfigInput({
      mode: 'specific',
      focus: 'apply-skill',
      topic: '  long division  ',
    });

    expect(result).toEqual({
      success: true,
      config: {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific',
        focus: 'apply-skill',
        topic: 'long division',
      },
    });
  });

  test('rejects an unknown mode rather than guessing', () => {
    const result = parseExitTicketConfigInput({ mode: 'multiple-choice' });
    expect(result.success).toBe(false);
  });

  test('a specific exit ticket needs a focus', () => {
    expect(
      parseExitTicketConfigInput({ mode: 'specific', topic: 'mitosis' }).success
    ).toBe(false);
    expect(
      parseExitTicketConfigInput({
        mode: 'specific',
        focus: 'invent-a-focus',
        topic: 'mitosis',
      }).success
    ).toBe(false);
  });

  test('a specific exit ticket needs a topic', () => {
    expect(
      parseExitTicketConfigInput({ mode: 'specific', focus: 'explain-concept' })
        .success
    ).toBe(false);
    expect(
      parseExitTicketConfigInput({
        mode: 'specific',
        focus: 'explain-concept',
        topic: '   ',
      }).success
    ).toBe(false);
  });

  test('bounds the topic so it stays a phrase, not a prompt', () => {
    const result = parseExitTicketConfigInput({
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'a'.repeat(EXIT_TICKET_TOPIC_MAX_LENGTH + 1),
    });

    expect(result.success).toBe(false);
  });
});

describe('parseStoredExitTicketConfig', () => {
  test('reads back what was written', () => {
    const config = {
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'specific' as const,
      focus: 'clear-up-confusion' as const,
      topic: 'the water cycle',
    };

    expect(parseStoredExitTicketConfig(config)).toEqual(config);
  });

  test('every assignment that predates exit tickets reads as no config', () => {
    // Rows created before this column existed carry null, and nothing
    // downstream may treat that as a malformed exit ticket.
    expect(parseStoredExitTicketConfig(null)).toBeNull();
    expect(parseStoredExitTicketConfig(undefined)).toBeNull();
    expect(parseStoredExitTicketConfig('basic')).toBeNull();
    expect(parseStoredExitTicketConfig({ mode: 'specific' })).toBeNull();
    expect(
      parseStoredExitTicketConfig({ schemaVersion: 99, mode: 'basic' })
    ).toBeNull();
  });
});

describe('exit ticket defaults', () => {
  test('the tutor starts off', () => {
    // An exit ticket checks what the student understands on their own. A
    // tutor in the document would be answering the question for them.
    expect(EXIT_TICKET_TUTOR_ENABLED_DEFAULT).toBe(false);
  });

  test('grading starts as feedback only, and points are worth a few', () => {
    // The assistant still reads and scores every response either way. This
    // decides only whether that score reaches the gradebook.
    expect(EXIT_TICKET_SUBMIT_FOR_GRADE_DEFAULT).toBe(false);
    // Five minutes of writing is not a hundred-point assignment.
    expect(EXIT_TICKET_DEFAULT_POINT_VALUE).toBeLessThan(
      DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE
    );
  });

  test('lesson notes start open only when the ticket is specific', () => {
    // A specific ticket already has a teacher naming what they are checking,
    // so asking what the lesson covered is the natural next question. A basic
    // ticket is meant to be one click.
    expect(defaultExitTicketLessonNotesEnabled('basic')).toBe(false);
    expect(defaultExitTicketLessonNotesEnabled('specific')).toBe(true);
  });

  test('every lesson note field is labelled and scaffolded', () => {
    expect(EXIT_TICKET_LESSON_NOTE_FIELDS.map((field) => field.key)).toEqual([
      'mainPoints',
      'mustMention',
      'watchFor',
    ]);
    for (const field of EXIT_TICKET_LESSON_NOTE_FIELDS) {
      expect(field.label.trim()).not.toBe('');
      expect(field.placeholder.trim()).not.toBe('');
    }
  });
});

describe('lesson notes', () => {
  const notes = {
    mainPoints: 'Weathering breaks rock down in place; erosion moves it.',
    mustMention: 'The difference is whether the material moves.',
    watchFor: 'Using the two words interchangeably.',
  };

  test('are kept, trimmed, on either shape of ticket', () => {
    const basic = parseExitTicketConfigInput({
      mode: 'basic',
      lessonMainPoints: `  ${notes.mainPoints}  `,
      lessonMustMention: notes.mustMention,
      lessonWatchFor: notes.watchFor,
    });
    expect(basic.success).toBe(true);
    if (!basic.success) return;
    expect(basic.config.lessonNotes).toEqual(notes);

    const specific = parseExitTicketConfigInput({
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'erosion',
      lessonMainPoints: notes.mainPoints,
    });
    expect(specific.success).toBe(true);
    if (!specific.success) return;
    expect(specific.config.lessonNotes).toEqual({
      mainPoints: notes.mainPoints,
      mustMention: '',
      watchFor: '',
    });
  });

  test('are omitted entirely when the teacher wrote nothing', () => {
    // Nothing to store means no key, so a ticket without notes is
    // byte-identical to one created before notes existed.
    const result = parseExitTicketConfigInput({
      mode: 'basic',
      lessonMainPoints: '   ',
      lessonMustMention: '',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('lessonNotes' in result.config).toBe(false);
  });

  test('are bounded so they stay notes', () => {
    const result = parseExitTicketConfigInput({
      mode: 'basic',
      lessonMainPoints: 'a'.repeat(EXIT_TICKET_LESSON_NOTE_MAX_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  test('never reach the prompt students read', () => {
    // "What they absolutely should mention" is the answer key. Composing it
    // into the student prompt would hand the answer over.
    for (const config of [
      {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'basic' as const,
        lessonNotes: notes,
      },
      {
        schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
        mode: 'specific' as const,
        focus: 'explain-concept' as const,
        topic: 'erosion',
        lessonNotes: notes,
      },
    ]) {
      const prompt = composeExitTicketPrompt(config);
      expect(prompt).not.toInclude(notes.mainPoints);
      expect(prompt).not.toInclude(notes.mustMention);
      expect(prompt).not.toInclude(notes.watchFor);
    }
  });

  test('read back from storage, and a malformed value reads as none', () => {
    const stored = parseStoredExitTicketConfig({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
      lessonNotes: notes,
    });
    expect(stored?.lessonNotes).toEqual(notes);

    const withoutNotes = parseStoredExitTicketConfig({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });
    expect(withoutNotes).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });

    const malformed = parseStoredExitTicketConfig({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
      lessonNotes: 'just a string',
    });
    expect(malformed).toEqual({
      schemaVersion: EXIT_TICKET_CONFIG_SCHEMA_VERSION,
      mode: 'basic',
    });
  });
});

describe('exitTicketTargetingHint', () => {
  const none = { mainPoints: '', mustMention: '', watchFor: '' };

  test('says a bare ticket is open-ended rather than wrong', () => {
    // A vague exit ticket is a real choice, so the empty state reads as a
    // trade-off, never as an error the teacher has to fix.
    for (const value of [null, undefined, none]) {
      const hint = exitTicketTargetingHint(value);
      expect(hint).toInclude('on their own terms');
      expect(hint.toLowerCase()).not.toInclude('required');
    }
  });

  test('gets more definite as the teacher fills boxes in', () => {
    const partial = exitTicketTargetingHint({ ...none, mainPoints: 'x' });
    const full = exitTicketTargetingHint({
      mainPoints: 'x',
      mustMention: 'y',
      watchFor: 'z',
    });

    expect(partial).not.toBe(exitTicketTargetingHint(none));
    expect(partial).toInclude('more specific');
    expect(full).toInclude('as targeted as an exit ticket gets');
  });

  test('counts only boxes with something actually in them', () => {
    expect(exitTicketTargetingHint({ ...none, mainPoints: '   ' })).toBe(
      exitTicketTargetingHint(none)
    );
  });
});
