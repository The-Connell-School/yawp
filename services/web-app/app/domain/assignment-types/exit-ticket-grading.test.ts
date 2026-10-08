import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_ASSESS_FOR_MAX_LENGTH,
  EXIT_TICKET_GRADING_BASIS_OPTIONS,
  EXIT_TICKET_MIN_SENTENCES_MAX,
  EXIT_TICKET_MIN_WORDS_MAX,
  exitTicketCriteriaNoteKeys,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
  type ExitTicketConfigInput,
} from './exit-ticket';
import { buildExitTicketGradingContext } from './exit-ticket-rubric';

const OBJECTIVE_CHECK: ExitTicketConfigInput = {
  kind: 'check',
  focus: 'explain-concept',
  topic: 'the difference between a theme and a topic',
  answerType: 'objective',
};

const SUBJECTIVE_CHECK: ExitTicketConfigInput = {
  ...OBJECTIVE_CHECK,
  focus: 'understand-text',
  topic: 'the second stanza',
  answerType: 'subjective',
};

function parse(input: ExitTicketConfigInput) {
  return parseExitTicketConfigInput(input);
}

describe('grading options', () => {
  test('a reflection is graded for completion or for quality', () => {
    expect(EXIT_TICKET_GRADING_BASIS_OPTIONS.map((o) => o.value)).toEqual([
      'completion',
      'bands',
    ]);
  });
});

describe('an ungraded ticket', () => {
  test('stores no grading, whatever criteria came along', () => {
    const result = parse({
      kind: 'reflection',
      graded: false,
      gradingBasis: 'bands',
      minWords: '50',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('grading' in result.config).toBe(false);
  });

  test('needs no criteria at all', () => {
    expect(parse({ ...OBJECTIVE_CHECK, graded: false }).success).toBe(true);
    expect(parse({ ...SUBJECTIVE_CHECK, graded: false }).success).toBe(true);
  });

  test('a client that never says whether it is graded is never checked', () => {
    // v1 clients post no `graded` at all.
    expect(parse({ mode: 'basic' }).success).toBe(true);
  });
});

describe('a graded reflection', () => {
  test('graded for completion needs nothing more', () => {
    const result = parse({
      kind: 'reflection',
      graded: true,
      gradingBasis: 'completion',
    });
    expect(result).toMatchObject({
      success: true,
      config: { grading: { basis: 'completion' } },
    });
  });

  test('must say whether it is completion or quality', () => {
    expect(parse({ kind: 'reflection', graded: true })).toEqual({
      success: false,
      message: 'Choose how this reflection is graded.',
    });
  });

  test('graded for quality needs the main points or a length', () => {
    expect(
      parse({ kind: 'reflection', graded: true, gradingBasis: 'bands' })
    ).toEqual({
      success: false,
      message:
        'Add the main points of the lesson or a minimum length, so there is something to grade against.',
    });

    expect(
      parse({
        kind: 'reflection',
        graded: true,
        gradingBasis: 'bands',
        lessonMainPoints: 'A theme makes a claim; a topic does not.',
      }).success
    ).toBe(true);

    expect(
      parse({
        kind: 'reflection',
        graded: true,
        gradingBasis: 'bands',
        minSentences: '3',
      })
    ).toMatchObject({
      success: true,
      config: { grading: { basis: 'bands', minSentences: 3 } },
    });
  });
});

describe('a graded check', () => {
  test('with a right answer needs that answer', () => {
    expect(parse({ ...OBJECTIVE_CHECK, graded: true })).toEqual({
      success: false,
      message: 'Add the correct answer so this can be graded.',
    });

    const result = parse({
      ...OBJECTIVE_CHECK,
      graded: true,
      lessonMustMention: 'A theme has to make a claim.',
    });
    expect(result).toMatchObject({
      success: true,
      config: {
        grading: { basis: 'bands' },
        lessonNotes: { mustMention: 'A theme has to make a claim.' },
      },
    });
  });

  test('without a single right answer needs what to assess', () => {
    expect(parse({ ...SUBJECTIVE_CHECK, graded: true })).toEqual({
      success: false,
      message: 'Say what to assess, since there is no single right answer.',
    });

    expect(
      parse({
        ...SUBJECTIVE_CHECK,
        graded: true,
        assessFor: '  Points to a specific line  ',
      })
    ).toMatchObject({
      success: true,
      config: {
        grading: { basis: 'bands', assessFor: 'Points to a specific line' },
      },
    });
  });

  test('a length alone is enough when there is no single right answer', () => {
    expect(
      parse({ ...SUBJECTIVE_CHECK, graded: true, minWords: '40' })
    ).toMatchObject({
      success: true,
      config: { grading: { basis: 'bands', minWords: 40 } },
    });
  });

  test('is always read in bands, whatever basis was posted', () => {
    expect(
      parse({
        ...OBJECTIVE_CHECK,
        graded: true,
        gradingBasis: 'completion',
        lessonMustMention: 'A claim.',
      })
    ).toMatchObject({ success: true, config: { grading: { basis: 'bands' } } });
  });
});

describe('length expectations', () => {
  test('must be whole numbers in range', () => {
    const base = {
      kind: 'reflection',
      graded: true,
      gradingBasis: 'completion',
    };
    expect(parse({ ...base, minWords: '0' }).success).toBe(false);
    expect(parse({ ...base, minWords: 'lots' }).success).toBe(false);
    expect(
      parse({ ...base, minWords: String(EXIT_TICKET_MIN_WORDS_MAX + 1) })
        .success
    ).toBe(false);
    expect(
      parse({
        ...base,
        minSentences: String(EXIT_TICKET_MIN_SENTENCES_MAX + 1),
      }).success
    ).toBe(false);
    expect(parse({ ...base, minWords: '' }).success).toBe(true);
  });

  test('what to assess has a length limit', () => {
    expect(
      parse({
        ...SUBJECTIVE_CHECK,
        graded: true,
        assessFor: 'x'.repeat(EXIT_TICKET_ASSESS_FOR_MAX_LENGTH + 1),
      }).success
    ).toBe(false);
  });
});

describe('exitTicketCriteriaNoteKeys', () => {
  test('names the lesson notes a graded ticket asks for as criteria', () => {
    expect(
      exitTicketCriteriaNoteKeys({
        kind: 'reflection',
        graded: false,
        answerType: '',
        basis: 'bands',
      })
    ).toEqual([]);
    expect(
      exitTicketCriteriaNoteKeys({
        kind: 'reflection',
        graded: true,
        answerType: '',
        basis: 'bands',
      })
    ).toEqual(['mainPoints']);
    expect(
      exitTicketCriteriaNoteKeys({
        kind: 'reflection',
        graded: true,
        answerType: '',
        basis: 'completion',
      })
    ).toEqual([]);
    expect(
      exitTicketCriteriaNoteKeys({
        kind: 'check',
        graded: true,
        answerType: 'objective',
        basis: 'completion',
      })
    ).toEqual(['mustMention', 'watchFor']);
    expect(
      exitTicketCriteriaNoteKeys({
        kind: 'check',
        graded: true,
        answerType: 'subjective',
        basis: 'completion',
      })
    ).toEqual([]);
  });
});

describe('parseStoredExitTicketConfig with grading', () => {
  test('reads what was stored', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        grading: { basis: 'completion', minWords: 30 },
      })
    ).toEqual({
      schemaVersion: 1,
      mode: 'basic',
      grading: { basis: 'completion', minWords: 30 },
    });
  });

  test('drops grading it cannot read rather than failing the ticket', () => {
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        grading: { basis: 'steps' },
      })
    ).toEqual({ schemaVersion: 1, mode: 'basic' });
    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'basic',
        grading: { basis: 'completion', minWords: -3 },
      })
    ).toEqual({
      schemaVersion: 1,
      mode: 'basic',
      grading: { basis: 'completion' },
    });
  });
});

describe('grading context', () => {
  test('completion: any good-faith attempt earns full marks', () => {
    const context = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      grading: { basis: 'completion' },
    });
    expect(context).toInclude('completion');
    expect(context).toInclude('score it 100');
  });

  test('a length is a threshold, stated in the teacher’s unit', () => {
    const words = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      grading: { basis: 'bands', minWords: 40 },
    });
    expect(words).toInclude('at least 40 words');
    const sentences = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      grading: { basis: 'bands', minSentences: 3 },
    });
    expect(sentences).toInclude('at least 3 sentences');
  });

  test('what to assess is handed to the grader verbatim', () => {
    const context = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic: 'the second stanza',
      answerType: 'subjective',
      grading: { basis: 'bands', assessFor: 'Points to a specific line' },
    });
    expect(context).toInclude('Points to a specific line');
  });
});
