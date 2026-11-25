import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_V2_DEFAULT_POINT_VALUE,
  exitTicketFocusOption,
  parseExitTicketConfigInput,
  parseStoredExitTicketConfig,
  type ExitTicketConfig,
  type ExitTicketConfigInput,
} from './exit-ticket';
import { exitTicketActivityOption } from './exit-ticket-activities';
import {
  EXIT_TICKET_PART_A_REFLECTION,
  EXIT_TICKET_PART_B_SINGLE_ANSWER,
  EXIT_TICKET_PART_C_CHECK,
  EXIT_TICKET_UNIVERSAL_BLOCK,
  applyExitTicketGradingAssistant,
  buildExitTicketGradingAssistantPrompt,
  clampExitTicketScore,
  exitTicketGradingAssistantPart,
  exitTicketGradingPlainSummary,
  exitTicketPersistedGrade,
  resolveExitTicketPointTotal,
} from './exit-ticket-grading-assistant';

function parse(input: ExitTicketConfigInput): ExitTicketConfig {
  const result = parseExitTicketConfigInput(input);
  if (!result.success) throw new Error(result.message);
  return result.config;
}

const REFLECTION: ExitTicketConfig = {
  schemaVersion: 1,
  mode: 'basic',
  kind: 'reflection',
};

const CHECK: ExitTicketConfig = {
  schemaVersion: 1,
  mode: 'specific',
  kind: 'check',
  focus: 'explain-concept',
  topic: 'Holden as narrator',
  answerType: 'objective',
  correctAnswer:
    'A direct quote from page one; Holden exaggerates, contradicts himself, or admits he lies.',
  grading: { basis: 'bands', minSentences: 3 },
};

describe('exit ticket grading assistant prompt', () => {
  test('a reflection pastes the universal block, then Part A', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: REFLECTION,
      studentPrompt: 'Tell me what you learned today.',
      pointValue: 5,
      submitForGrade: true,
    });

    expect(prompt.startsWith(EXIT_TICKET_UNIVERSAL_BLOCK)).toBe(true);
    expect(prompt).toContain(EXIT_TICKET_PART_A_REFLECTION);
    expect(prompt.indexOf(EXIT_TICKET_UNIVERSAL_BLOCK)).toBeLessThan(
      prompt.indexOf(EXIT_TICKET_PART_A_REFLECTION)
    );
    expect(prompt).not.toContain(EXIT_TICKET_PART_B_SINGLE_ANSWER);
    expect(prompt).not.toContain(EXIT_TICKET_PART_C_CHECK);
    expect(prompt).toContain('Exit ticket type: Reflection');
    expect(prompt).toContain('Tell me what you learned today.');
    expect(prompt).toContain('Point total: 5');
    expect(prompt).toContain('Grade this ticket: yes.');
    expect(prompt).not.toContain('Correct answer:');
    expect(prompt).not.toContain('What a strong answer includes:');
    expect(prompt).toContain('Minimum length: none.');
  });

  test('a reflection with a minimum length passes it, both kinds', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: {
        ...REFLECTION,
        grading: { basis: 'completion', minSentences: 3, minWords: 50 },
      },
      pointValue: 5,
    });
    expect(prompt).toContain(
      'Minimum length: at least 3 sentences and at least 50 words.'
    );
  });

  test('a check made before the yes/no question pastes Part C, with the teacher’s notes', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: CHECK,
      studentPrompt:
        'Look at the first page of The Catcher in the Rye. Quote one line that shows Holden is an unreliable narrator.',
      pointValue: 5,
      submitForGrade: true,
    });

    expect(prompt.startsWith(EXIT_TICKET_UNIVERSAL_BLOCK)).toBe(true);
    expect(prompt).toContain(EXIT_TICKET_PART_C_CHECK);
    expect(prompt).not.toContain(EXIT_TICKET_PART_B_SINGLE_ANSWER);
    expect(prompt).toContain('Exit ticket type: Check for understanding');
    expect(prompt).toContain('Is there a single correct answer? No.');
    expect(prompt).toContain('What a strong answer includes:');
    // The preset the teacher clicked is not passed.
    expect(prompt).not.toContain('What the teacher is checking for');
    expect(prompt).toContain('Quote one line that shows Holden');
    expect(prompt).toContain(CHECK.correctAnswer!);
    expect(prompt).toContain('Minimum length: at least 3 sentences.');
    expect(prompt).toContain('Point total: 5');
  });

  test('a word and sentence minimum are both passed through', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: {
        ...CHECK,
        focus: 'understand-text',
        grading: { basis: 'bands', minWords: 40, minSentences: 2 },
      },
      studentPrompt: 'What is the second stanza saying?',
      pointValue: 12,
    });

    expect(prompt).toContain(
      'Minimum length: at least 2 sentences and at least 40 words.'
    );
    expect(prompt).toContain('Point total: 12');
  });

  test('a check with no minimum length says so', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: { ...CHECK, grading: undefined },
      studentPrompt: 'Explain erosion.',
      pointValue: 20,
    });
    expect(prompt).toContain('Minimum length: none.');
    expect(prompt).toContain('Point total: 20');
  });

  test('the retired four-band rubric and per-option criteria are not in the prompt', () => {
    const prompts = [
      buildExitTicketGradingAssistantPrompt({
        config: REFLECTION,
        studentPrompt: 'What landed?',
        pointValue: 5,
      }),
      buildExitTicketGradingAssistantPrompt({
        config: CHECK,
        studentPrompt: 'Explain it.',
        pointValue: 5,
      }),
    ];
    const retired = [
      'Names it only',
      'Partly there',
      'Explains it',
      'No evidence',
      'Score inside these bands',
      'score it 100',
      exitTicketFocusOption('explain-concept')!.gradingCriteria,
      exitTicketFocusOption('ask-question')!.gradingCriteria,
      exitTicketFocusOption('understand-text')!.gradingCriteria,
      exitTicketActivityOption('reflect')!.gradingCriteria,
    ];
    for (const prompt of prompts) {
      for (const phrase of retired) {
        expect(prompt).not.toContain(phrase);
      }
    }
  });

  test('a legacy check without the new field falls back to the old must-mention note', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: {
        schemaVersion: 1,
        mode: 'specific',
        focus: 'explain-concept',
        topic: 'theme and topic',
        answerType: 'objective',
        lessonNotes: {
          mainPoints: 'Today was about theme.',
          mustMention: 'A theme has to make a claim.',
          watchFor: 'Using the two words interchangeably.',
        },
      },
      pointValue: 5,
    });

    expect(prompt).toContain('A theme has to make a claim.');
    expect(prompt).not.toContain('Using the two words interchangeably.');
    expect(prompt).not.toContain('Today was about theme.');
  });

  test('a legacy ticket with no answer key still grades', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: {
        schemaVersion: 1,
        mode: 'specific',
        focus: 'ask-question',
        topic: 'semicolons',
        answerType: 'subjective',
      },
    });

    expect(prompt).toContain(EXIT_TICKET_PART_C_CHECK);
    expect(prompt).toContain(
      'What a strong answer includes:\nNone. The teacher left this empty.'
    );
    expect(prompt).toContain('Point total: 5');
  });

  test('an ungraded ticket still gets the assistant, and says nothing goes in the gradebook', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: REFLECTION,
      studentPrompt: 'What did you learn?',
      submitForGrade: false,
    });
    expect(prompt).toContain(EXIT_TICKET_PART_A_REFLECTION);
    expect(prompt).toContain('Grade this ticket: no.');
    expect(prompt).toContain('Nothing is recorded in the gradebook.');
  });

  test('Yes to a single correct answer pastes Part B, with the correct answer', () => {
    const config: ExitTicketConfig = {
      ...CHECK,
      promptVersion: 3,
      singleCorrectAnswer: true,
      correctAnswer: 'Unreliable narrator',
      grading: { basis: 'bands' },
    };
    expect(exitTicketGradingAssistantPart(config)).toBe('single-answer');
    const prompt = buildExitTicketGradingAssistantPrompt({
      config,
      studentPrompt: 'What is a narrator the reader can’t fully trust called?',
      pointValue: 5,
    });
    expect(prompt.startsWith(EXIT_TICKET_UNIVERSAL_BLOCK)).toBe(true);
    expect(prompt).toContain(EXIT_TICKET_PART_B_SINGLE_ANSWER);
    expect(prompt).not.toContain(EXIT_TICKET_PART_C_CHECK);
    expect(prompt).toContain('Is there a single correct answer? Yes.');
    expect(prompt).toContain('Correct answer:\nUnreliable narrator');
  });

  test('No to a single correct answer pastes Part C', () => {
    expect(
      exitTicketGradingAssistantPart({ ...CHECK, singleCorrectAnswer: false })
    ).toBe('check');
    expect(exitTicketGradingAssistantPart(REFLECTION)).toBe('reflection');
    expect(exitTicketGradingAssistantPart(null)).toBe('reflection');
  });

  test('the stored assignment prompt is the question, ahead of a recomposed one', () => {
    const prompt = buildExitTicketGradingAssistantPrompt({
      config: {
        schemaVersion: 1,
        mode: 'basic',
        reflectionPrompt: { id: 'custom', text: 'Config question' },
      },
      studentPrompt: 'The question students actually saw.',
    });
    expect(prompt).toContain('The question students actually saw.');
    expect(prompt).not.toContain('Config question');
  });
});

describe('exit ticket score clamping', () => {
  test('the v2 point total defaults to 5', () => {
    expect(EXIT_TICKET_V2_DEFAULT_POINT_VALUE).toBe(5);
    expect(resolveExitTicketPointTotal(null, { v2Grading: true })).toBe(5);
    expect(resolveExitTicketPointTotal(undefined, { v2Grading: true })).toBe(5);
    expect(resolveExitTicketPointTotal(0, { v2Grading: true })).toBe(5);
    expect(resolveExitTicketPointTotal(1.5, { v2Grading: true })).toBe(5);
    expect(resolveExitTicketPointTotal(12, { v2Grading: true })).toBe(12);
  });

  test('a reflection with no minimum length is only full credit or none', () => {
    expect(clampExitTicketScore(0, 'reflection', 5)).toBe(0);
    expect(clampExitTicketScore(5, 'reflection', 5)).toBe(5);
    expect(clampExitTicketScore(1, 'reflection', 5)).toBe(0);
    expect(clampExitTicketScore(2, 'reflection', 5)).toBe(0);
    expect(clampExitTicketScore(3, 'reflection', 5)).toBe(5);
    expect(clampExitTicketScore(4, 'reflection', 5)).toBe(5);
    expect(clampExitTicketScore(2.6, 'reflection', 5)).toBe(5);
    expect(clampExitTicketScore(-4, 'reflection', 5)).toBe(0);
    expect(clampExitTicketScore(Number.NaN, 'reflection', 5)).toBe(0);
  });

  test('a reflection with a minimum length keeps credit by length', () => {
    for (const score of [0, 1, 2, 3, 4, 5]) {
      expect(
        clampExitTicketScore(score, 'reflection', 5, { hasMinimumLength: true })
      ).toBe(score);
    }
    expect(
      clampExitTicketScore(5, 'reflection', 12, { hasMinimumLength: true })
    ).toBe(5);
  });

  test('a single answer is 0, half rounded up, or full; one below full only with a minimum', () => {
    expect(clampExitTicketScore(0, 'single-answer', 5)).toBe(0);
    expect(clampExitTicketScore(3, 'single-answer', 5)).toBe(3);
    expect(clampExitTicketScore(5, 'single-answer', 5)).toBe(5);
    expect(clampExitTicketScore(4, 'single-answer', 5)).toBe(5);
    expect(clampExitTicketScore(1, 'single-answer', 5)).toBe(0);
    expect(clampExitTicketScore(2, 'single-answer', 5)).toBe(3);
    expect(
      clampExitTicketScore(4, 'single-answer', 5, { hasMinimumLength: true })
    ).toBe(4);
    expect(clampExitTicketScore(5, 'single-answer', 10)).toBe(5);
  });

  test('a check keeps any whole number from 1 through one below the total', () => {
    for (const score of [0, 1, 2, 3, 4, 5]) {
      expect(clampExitTicketScore(score, 'check', 5)).toBe(score);
    }
    expect(clampExitTicketScore(3.4, 'check', 5)).toBe(3);
    expect(clampExitTicketScore(3.6, 'check', 5)).toBe(4);
    expect(clampExitTicketScore(11, 'check', 5)).toBe(5);
    expect(clampExitTicketScore(-2, 'check', 5)).toBe(0);

    expect(clampExitTicketScore(7, 'check', 12)).toBe(7);
    expect(clampExitTicketScore(1, 'check', 12)).toBe(1);
    expect(clampExitTicketScore(11, 'check', 12)).toBe(11);
    expect(clampExitTicketScore(19, 'check', 20)).toBe(19);
    expect(clampExitTicketScore(20.4, 'check', 20)).toBe(20);
  });
});

describe('ungraded exit tickets', () => {
  test('keep the comment and record nothing in the gradebook', () => {
    const recorded = exitTicketPersistedGrade({
      submitForGrade: false,
      earned: 5,
      pointTotal: 5,
      comment: 'You named the one thing that stuck.',
      teacherNote: 'Asked whether the test is Friday.',
    });

    expect(recorded.comment).toBe('You named the one thing that stuck.');
    expect(recorded.teacherNote).toBe('Asked whether the test is Friday.');
    expect(recorded.gradebookScore).toBeNull();
    expect(recorded.overallScore).toBeNull();
    expect(recorded.numericPercentage).toBeNull();
    expect(recorded.letterGrade).toBeNull();
  });

  test('a graded ticket records points out of the total', () => {
    expect(
      exitTicketPersistedGrade({
        submitForGrade: true,
        earned: 4,
        pointTotal: 5,
        comment: 'The quote is missing.',
        teacherNote: null,
      })
    ).toMatchObject({
      gradebookScore: '4/5',
      overallScore: 4,
      numericPercentage: null,
    });
  });
});

describe('applyExitTicketGradingAssistant', () => {
  test('replaces a stored four-band rubric so it cannot run alongside', () => {
    const applied = applyExitTicketGradingAssistant(
      {
        assignmentTypeKind: 'exit_ticket',
        scoringType: 'rubric_points',
        minScore: 0,
        maxScore: 100,
        step: 1,
        rubricCategories: [
          {
            key: 'understanding',
            label: 'Understanding',
            weight: 1,
            description: 'Old bands.',
            bands: [
              { min: 0, max: 0, label: 'No evidence', description: 'Blank.' },
              { min: 1, max: 44, label: 'Names it only', description: 'Thin.' },
            ],
          },
        ],
        instructions: {
          mode: 'unified' as const,
          gradingInstructions: 'Score inside these bands. Names it only.',
        },
        rubricSnapshot: {},
        promptConfigSnapshot: {
          gradingInstructionsOverride: 'Score inside these bands.',
        },
      },
      { config: CHECK, studentPrompt: 'Explain Holden.', pointValue: 5, submitForGrade: true }
    );

    expect(applied.maxScore).toBe(5);
    expect(applied.minScore).toBe(0);
    expect(applied.step).toBe(1);
    expect(applied.scoringType).toBe('rubric_points');
    expect(applied.rubricCategories[0]?.bands).toBeUndefined();
    expect(applied.instructions.mode).toBe('unified');
    if (applied.instructions.mode !== 'unified') return;
    expect(applied.instructions.gradingInstructions).toContain(
      EXIT_TICKET_PART_C_CHECK
    );
    expect(applied.instructions.gradingInstructions).not.toContain(
      'Names it only'
    );
    expect(applied.promptConfigSnapshot.gradingInstructionsOverride).toBeNull();
  });

  test('leaves every other assignment type alone', () => {
    const original = {
      assignmentTypeKind: 'daily_pages',
      scoringType: 'rubric_points',
      minScore: 0,
      maxScore: 100,
      step: 1,
      rubricCategories: [],
      instructions: {
        mode: 'unified' as const,
        gradingInstructions: 'Daily Pages stays.',
      },
      rubricSnapshot: {},
      promptConfigSnapshot: {},
    };
    expect(applyExitTicketGradingAssistant(original, { pointValue: 5 })).toBe(
      original
    );
  });
});

describe('correct answer field contract', () => {
  test('stores the new field and reads a ticket that never had it', () => {
    const saved = parse({
      kind: 'check',
      focus: 'understand-text',
      topic: 'page one',
      answerType: 'objective',
      correctAnswer: 'A direct quote; Holden admits he lies.',
      graded: true,
    });
    expect(saved.mode === 'specific' && saved.correctAnswer).toBe(
      'A direct quote; Holden admits he lies.'
    );
    expect(parseStoredExitTicketConfig(saved)).toEqual(saved);

    expect(
      parseStoredExitTicketConfig({
        schemaVersion: 1,
        mode: 'specific',
        focus: 'explain-concept',
        topic: 'theme',
        answerType: 'subjective',
      })
    ).toEqual({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'theme',
      answerType: 'subjective',
    });
  });

  test('a graded check can be keyed by the new field alone', () => {
    const result = parseExitTicketConfigInput({
      kind: 'check',
      focus: 'explain-concept',
      topic: 'theme',
      answerType: 'objective',
      graded: true,
      correctAnswer: 'A theme makes a claim.',
    });
    expect(result.success).toBe(true);
  });
});

describe('exitTicketGradingPlainSummary (Brian, Nov 25)', () => {
  const text = (summary: { intro: string; rows: { label: string; text: string }[] }) =>
    [summary.intro, ...summary.rows.flatMap((row) => [row.label, row.text])].join('\n');

  test('a reflection explains completion in plain words, with no bands or codes', () => {
    const summary = exitTicketGradingPlainSummary(REFLECTION, 5);
    const all = text(summary);
    expect(all).toContain('Full credit (5/5)');
    expect(all).toContain('No credit (0)');
    expect(all).not.toContain('Partial credit');
    expect(all).not.toMatch(/Names it only|Rubric points|assignment-type:/);
  });

  test('a reflection with a minimum explains credit by length', () => {
    const all = text(
      exitTicketGradingPlainSummary(
        { ...REFLECTION, grading: { basis: 'completion', minSentences: 3 } },
        5
      )
    );
    expect(all).toContain('shorter than at least 3 sentences');
  });

  test('a single answer names the teacher’s answer and the half-credit hedge', () => {
    const all = text(
      exitTicketGradingPlainSummary(
        {
          ...CHECK,
          singleCorrectAnswer: true,
          correctAnswer: 'Unreliable narrator',
          grading: { basis: 'bands' },
        },
        10
      )
    );
    expect(all).toContain('“Unreliable narrator.”');
    expect(all).toContain('Half credit (5/10)');
    expect(all).not.toContain('One point off');
  });

  test('more than one right answer quotes the notes, or says there are none', () => {
    expect(exitTicketGradingPlainSummary(CHECK, 5).intro).toContain(
      'judged against your notes'
    );
    expect(
      exitTicketGradingPlainSummary(
        { ...CHECK, correctAnswer: undefined, singleCorrectAnswer: false },
        5
      ).intro
    ).toContain('You left no notes');
  });
});
