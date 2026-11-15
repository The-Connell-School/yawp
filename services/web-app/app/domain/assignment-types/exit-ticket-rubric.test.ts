import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_ANSWER_TYPE_GUIDANCE,
  EXIT_TICKET_FLEXIBLE_ANSWER_GUIDANCE,
  EXIT_TICKET_PROMPT_CONFIG,
  EXIT_TICKET_RUBRIC,
  EXIT_TICKET_SCORING_SCALE,
  EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY,
  buildExitTicketGradingContext,
} from './exit-ticket-rubric';
import {
  EXIT_TICKET_FOCUS_OPTIONS as EXIT_TICKET_FOCUS_OPTIONS_FOR_TEST,
  exitTicketActivityOption as exitTicketActivityOptionForTest,
  exitTicketFocusOption,
  parseExitTicketConfigInput,
  type ExitTicketConfigInput,
} from './exit-ticket';

function parseExitTicketConfigInputForTest(input: ExitTicketConfigInput) {
  const result = parseExitTicketConfigInput(input);
  if (!result.success) throw new Error(result.message);
  return result.config;
}
import {
  getCategoryScoreBounds,
  isBandScoredRubric,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';
import { computeWeightedBandPercentage } from '~/domain/grading/gradeMath';

describe('the Exit Ticket rubric shape', () => {
  test('judges understanding and nothing else', () => {
    expect(EXIT_TICKET_RUBRIC.categories).toHaveLength(1);
    expect(EXIT_TICKET_RUBRIC.categories[0].key).toBe(
      EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY
    );
    expect(EXIT_TICKET_RUBRIC.categories[0].weight).toBe(1);
  });

  test('is band scored, which is what honors the teacher’s point value', () => {
    // The points path records raw points and no percentage, so a ticket set to
    // 10 points would show "2/3". Bands produce a real percentage, which then
    // formats against the point value as "8 / 10".
    expect(isBandScoredRubric(EXIT_TICKET_RUBRIC.categories)).toBe(true);
    expect(getCategoryScoreBounds(EXIT_TICKET_RUBRIC.categories[0])).toEqual({
      min: 0,
      max: 100,
    });
    expect(EXIT_TICKET_SCORING_SCALE.minScore).toBe(0);
    expect(EXIT_TICKET_SCORING_SCALE.maxScore).toBe(100);
  });

  test('bands cover every score with no gap and no overlap', () => {
    const bands = [...(EXIT_TICKET_RUBRIC.categories[0].bands ?? [])];
    expect(bands.length).toBe(4);
    expect(bands[0].min).toBe(0);
    expect(bands.at(-1)!.max).toBe(100);
    for (let i = 1; i < bands.length; i += 1) {
      expect(bands[i].min).toBe(bands[i - 1].max + 1);
    }
    for (const band of bands) {
      expect(band.label.trim()).not.toBe('');
      expect(band.description.trim()).not.toBe('');
    }
  });

  test('what the bands are worth once they become points', () => {
    // The scale is read as a percentage of the teacher's point value, so the
    // band edges are the real grading policy. These are the claims that
    // matter, checked as points on a ten-point ticket.
    const outOfTen = (value: number) => Math.round((value / 100) * 10);
    const band = (label: string) =>
      EXIT_TICKET_RUBRIC.categories[0].bands!.find(
        (entry) => entry.label === label
      )!;

    // Nothing to read earns nothing. Not "almost nothing" — nothing.
    expect(band('No evidence').min).toBe(0);
    expect(band('No evidence').max).toBe(0);
    expect(outOfTen(band('No evidence').max)).toBe(0);

    // Answering without doing what was asked stays under half credit, however
    // correct the fragment is. A bare right answer on a ticket that asked for
    // reasoning is not most of the marks.
    expect(outOfTen(band('Names it only').max)).toBeLessThan(5);

    // Partial understanding is solid partial credit, not a near-miss on full.
    expect(outOfTen(band('Partly there').min)).toBeGreaterThanOrEqual(5);
    expect(outOfTen(band('Partly there').max)).toBeLessThan(9);

    // Explaining it is full-credit territory.
    expect(outOfTen(band('Explains it').max)).toBe(10);
  });

  test('scores read back on the scale the bands are written in', () => {
    const score = (value: number) =>
      computeWeightedBandPercentage(
        { [EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY]: { score: value } },
        EXIT_TICKET_RUBRIC.categories
      );

    expect(score(0)).toBe(0);
    expect(score(40)).toBe(40);
    expect(score(95)).toBe(95);
  });

  test('reads for understanding, not for polish', () => {
    const category = EXIT_TICKET_RUBRIC.categories[0];
    // Overall feedback only, and never marked up for grammar: an exit ticket
    // is five minutes of writing, not a draft.
    expect(category.feedbackEnabled).toBe(false);
    expect(resolveGrammarHighlightingEnabled([category])).toBe(false);
  });

  test('protects the student who is honest about what they missed', () => {
    const instructions = EXIT_TICKET_PROMPT_CONFIG.gradingInstructions ?? '';
    expect(instructions).toInclude('honest');
    // The lowest band is for nothing to read, never for a good-faith answer.
    const lowest = EXIT_TICKET_RUBRIC.categories[0].bands?.[0];
    expect(lowest?.description.toLowerCase()).toInclude('blank');
  });
});

describe('buildExitTicketGradingContext', () => {
  const notes = {
    mainPoints: 'Weathering breaks rock down; erosion moves it.',
    mustMention: 'The difference is whether the material moves.',
    watchFor: 'Using the two words interchangeably.',
  };

  test('renders the teacher notes, labelled for the grader', () => {
    const text = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      lessonNotes: notes,
    });

    expect(text).toInclude(notes.mainPoints);
    expect(text).toInclude(notes.mustMention);
    expect(text).toInclude(notes.watchFor);
  });

  test('omits a field the teacher left blank', () => {
    const text = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      lessonNotes: { ...notes, watchFor: '' },
    });

    expect(text).toInclude(notes.mainPoints);
    expect(text).not.toInclude('Mix-ups to watch for');
  });

  test('tells the grader how to read the bands for this focus', () => {
    const text = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'ask-question',
      answerType: 'subjective',
      topic: 'long division',
    });

    expect(text).toInclude(
      exitTicketFocusOption('ask-question')!.gradingCriteria
    );
    // Named too, so the grader knows which of the three it is reading.
    expect(text).toInclude('ask a question');
  });

  test('gives every focus its own criteria', () => {
    for (const option of EXIT_TICKET_FOCUS_OPTIONS_FOR_TEST) {
      const text = buildExitTicketGradingContext({
        schemaVersion: 1,
        mode: 'specific',
        focus: option.value,
        topic: 'anything',
        answerType: 'objective',
      });
      expect(text).toInclude(option.gradingCriteria);
    }
  });

  test('carries the focus criteria and the notes together', () => {
    const text = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'erosion',
      answerType: 'objective',
      lessonNotes: notes,
    });

    expect(text).toInclude(
      exitTicketFocusOption('explain-concept')!.gradingCriteria
    );
    expect(text).toInclude(notes.mustMention);
  });

  test('tells the grader whether a wrong answer is even possible', () => {
    // Without this the grader reads every ticket as though an answer key sat
    // behind it, and marks a defensible reading incorrect for not being the
    // one the teacher had in mind.
    const open = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'understand-text',
      topic: 'the second stanza',
      answerType: 'subjective',
    });
    expect(open).toInclude(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.subjective);
    expect(open).not.toInclude(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.objective);

    const keyed = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'specific',
      focus: 'explain-concept',
      topic: 'why the +7 comes off first',
      answerType: 'objective',
    });
    expect(keyed).toInclude(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.objective);
    expect(keyed).not.toInclude(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.subjective);
  });

  test('says nothing about right answers on a basic ticket', () => {
    // A basic ticket names no target, so there is nothing a desired response
    // could be desired against.
    const text = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      lessonNotes: notes,
    });
    for (const guidance of Object.values(EXIT_TICKET_ANSWER_TYPE_GUIDANCE)) {
      expect(text).not.toInclude(guidance);
    }
  });

  test('a basic ticket gets no focus criteria, because it has no focus', () => {
    const text = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      lessonNotes: notes,
    });

    for (const option of EXIT_TICKET_FOCUS_OPTIONS_FOR_TEST) {
      expect(text).not.toInclude(option.gradingCriteria);
    }
  });

  test('is null when there is nothing to say', () => {
    // No focus and no notes means the grader judges against the prompt alone,
    // exactly how a ticket created before any of this is graded.
    expect(
      buildExitTicketGradingContext({ schemaVersion: 1, mode: 'basic' })
    ).toBeNull();
    expect(buildExitTicketGradingContext(null)).toBeNull();
  });
});

describe('the grading context for a v3 ticket', () => {
  const answerQuestion = parseExitTicketConfigInputForTest({
    activity: 'answer-question',
    promptText: 'Who is Allie, and why does Holden keep thinking about him?',
    lessonMustMention: 'Holden’s younger brother, who died.',
    graded: true,
    gradingBasis: 'bands',
  });

  test('reads the activity’s criteria, not the legacy focus', () => {
    const context = buildExitTicketGradingContext(answerQuestion)!;
    expect(context).toContain(
      exitTicketActivityOptionForTest('answer-question')!.gradingCriteria
    );
    expect(context).not.toContain(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.subjective);
    expect(context).not.toContain(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.objective);
    expect(context).not.toContain('What this ticket is checking for: explain a concept');
  });

  test('credits a right answer in other words or spelling', () => {
    const context = buildExitTicketGradingContext(answerQuestion)!;
    expect(context).toContain(EXIT_TICKET_FLEXIBLE_ANSWER_GUIDANCE);
    expect(EXIT_TICKET_FLEXIBLE_ANSWER_GUIDANCE).toMatch(/Alley/);
  });

  test('calls the answer key what the form called it', () => {
    const context = buildExitTicketGradingContext(answerQuestion)!;
    expect(context).toContain(
      '- The correct answer, with the teacher’s context: Holden’s younger brother, who died.'
    );
  });

  test('names the activity by its short tag, not the form’s sentence', () => {
    const context = buildExitTicketGradingContext(answerQuestion)!;
    expect(context).toContain(
      'What this ticket asks the students to do: answer a question.'
    );
    expect(context).not.toContain('a question you ask');
  });

  test('reads the correct answer on an ungraded ticket too', () => {
    const ungraded = parseExitTicketConfigInputForTest({
      activity: 'answer-question',
      promptText: 'Who is Allie?',
      answerType: 'objective',
      lessonMustMention: 'Holden’s younger brother, who died.',
    });
    expect(ungraded.grading).toBeUndefined();
    expect(buildExitTicketGradingContext(ungraded)).toContain(
      '- The correct answer, with the teacher’s context: Holden’s younger brother, who died.'
    );
  });

  test('reads what the teacher wants Yawp! to know', () => {
    const withNote = parseExitTicketConfigInputForTest({
      activity: 'reflect',
      starter: 'learned',
      lessonMainPoints: 'We read chapters 1 to 3 today.',
    });
    expect(buildExitTicketGradingContext(withNote)).toContain(
      '- What the teacher wants Yawp! to know: We read chapters 1 to 3 today.'
    );
  });

  test('a check with no correct answer is read as having none', () => {
    const open = parseExitTicketConfigInputForTest({
      activity: 'engage-text',
      promptText: 'What is the speaker saying in stanza two?',
      answerType: 'subjective',
    });
    const context = buildExitTicketGradingContext(open)!;
    expect(context).toContain(EXIT_TICKET_ANSWER_TYPE_GUIDANCE.subjective);
    expect(context).not.toContain(EXIT_TICKET_FLEXIBLE_ANSWER_GUIDANCE);
  });

  test('a v3 reflection is read as a reflection, not a teacher-written custom question', () => {
    const reflection = parseExitTicketConfigInputForTest({
      activity: 'reflect',
      promptText: 'What surprised you today?',
    });
    const context = buildExitTicketGradingContext(reflection)!;
    expect(context).toContain(
      exitTicketActivityOptionForTest('reflect')!.gradingCriteria
    );
    expect(context).not.toContain('wrote this reflection question themselves');
    expect(context).not.toContain(EXIT_TICKET_FLEXIBLE_ANSWER_GUIDANCE);
  });

  test('a completion-graded check still says so', () => {
    const completion = parseExitTicketConfigInputForTest({
      activity: 'engage-text',
      promptText: 'Find the volta.',
      graded: true,
      gradingBasis: 'completion',
    });
    expect(buildExitTicketGradingContext(completion)).toContain(
      'The teacher is grading this for completion.'
    );
  });
});
