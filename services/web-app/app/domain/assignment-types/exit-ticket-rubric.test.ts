import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_PROMPT_CONFIG,
  EXIT_TICKET_RUBRIC,
  EXIT_TICKET_SCORING_SCALE,
  EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY,
  buildExitTicketGradingContext,
} from './exit-ticket-rubric';
import {
  EXIT_TICKET_FOCUS_OPTIONS as EXIT_TICKET_FOCUS_OPTIONS_FOR_TEST,
  exitTicketFocusOption,
} from './exit-ticket';
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

  test('grades humanely rather than mapping four steps onto a percentage', () => {
    // A 0-3 scale scaled linearly puts "partly there" at 67%, a D. The bands
    // are written on the scale the grade is read in, so they do not.
    const score = (value: number) =>
      computeWeightedBandPercentage(
        { [EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY]: { score: value } },
        EXIT_TICKET_RUBRIC.categories
      );

    expect(score(95)).toBe(95);
    expect(score(80)).toBeGreaterThanOrEqual(75);
    // "Partly there" tops out below the band that means they can explain it,
    // so a strong-but-incomplete answer cannot read as a full one.
    expect(score(85)).toBeLessThan(86);
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
      focus: 'apply-skill',
      topic: 'long division',
    });

    expect(text).toInclude(
      exitTicketFocusOption('apply-skill')!.gradingCriteria
    );
    // Named too, so the grader knows which of the six it is reading.
    expect(text).toInclude('apply a skill');
  });

  test('gives every focus its own criteria', () => {
    for (const option of EXIT_TICKET_FOCUS_OPTIONS_FOR_TEST) {
      const text = buildExitTicketGradingContext({
        schemaVersion: 1,
        mode: 'specific',
        focus: option.value,
        topic: 'anything',
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
      lessonNotes: notes,
    });

    expect(text).toInclude(
      exitTicketFocusOption('explain-concept')!.gradingCriteria
    );
    expect(text).toInclude(notes.mustMention);
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
