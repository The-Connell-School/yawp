import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_PROMPT_CONFIG,
  EXIT_TICKET_RUBRIC,
  EXIT_TICKET_SCORE_BANDS,
  EXIT_TICKET_SCORING_SCALE,
  EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY,
  buildExitTicketGradingContext,
} from './exit-ticket-rubric';
import {
  EXIT_TICKET_PART_A_REFLECTION,
  EXIT_TICKET_PART_B_CHECK,
} from './exit-ticket-grading-assistant';
import { exitTicketFocusOption } from './exit-ticket';
import {
  isBandScoredRubric,
  resolveGrammarHighlightingEnabled,
} from './rubric-category-options';

describe('the Exit Ticket rubric shape', () => {
  test('judges understanding and nothing else', () => {
    expect(EXIT_TICKET_RUBRIC.categories).toHaveLength(1);
    expect(EXIT_TICKET_RUBRIC.categories[0].key).toBe(
      EXIT_TICKET_UNDERSTANDING_CATEGORY_KEY
    );
    expect(EXIT_TICKET_RUBRIC.categories[0].weight).toBe(1);
  });

  test('scores whole points, not the retired four bands', () => {
    expect(isBandScoredRubric(EXIT_TICKET_RUBRIC.categories)).toBe(false);
    expect(EXIT_TICKET_RUBRIC.categories[0].bands).toBeUndefined();
    expect(EXIT_TICKET_SCORING_SCALE).toEqual({
      type: 'rubric_points',
      minScore: 0,
      maxScore: 5,
    });
    const instructions = EXIT_TICKET_PROMPT_CONFIG.gradingInstructions ?? '';
    expect(instructions).not.toContain('Score inside these bands');
    expect(instructions).not.toContain('Names it only');
    for (const band of EXIT_TICKET_SCORE_BANDS) {
      expect(instructions).not.toContain(band.label);
    }
  });

  test('keeps the retired bands only for the class read of old scores', () => {
    expect(EXIT_TICKET_SCORE_BANDS.map((band) => band.label)).toEqual([
      'No evidence',
      'Names it only',
      'Partly there',
      'Explains it',
    ]);
  });

  test('reads for understanding, not for polish', () => {
    const category = EXIT_TICKET_RUBRIC.categories[0];
    expect(category.feedbackEnabled).toBe(false);
    expect(resolveGrammarHighlightingEnabled([category])).toBe(false);
  });
});

describe('buildExitTicketGradingContext', () => {
  test('is the new assistant, and says nothing when this is not an exit ticket', () => {
    expect(buildExitTicketGradingContext(null)).toBeNull();
    const reflection = buildExitTicketGradingContext({
      schemaVersion: 1,
      mode: 'basic',
      kind: 'reflection',
    });
    expect(reflection).toContain(EXIT_TICKET_PART_A_REFLECTION);
    expect(reflection).not.toContain(
      exitTicketFocusOption('explain-concept')!.gradingCriteria
    );

    const check = buildExitTicketGradingContext(
      {
        schemaVersion: 1,
        mode: 'specific',
        kind: 'check',
        focus: 'understand-text',
        topic: 'stanza two',
        answerType: 'objective',
        correctAnswer: 'The speaker changes her mind.',
      },
      { studentPrompt: 'What changes in stanza two?', pointValue: 8 }
    );
    expect(check).toContain(EXIT_TICKET_PART_B_CHECK);
    expect(check).toContain('The speaker changes her mind.');
    expect(check).toContain('Point total: 8');
  });
});
