import { describe, expect, test } from 'bun:test';
import {
  EXIT_TICKET_PART_A_REFLECTION,
  EXIT_TICKET_PART_B_CHECK,
} from './exit-ticket-grading-assistant';
import { applyExitTicketGradingWhenV2Enabled } from './exit-ticket-grading-v2-config';

const LEGACY_EXIT_TICKET_CONFIG = {
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
      description: 'Four-band exit ticket.',
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
};

describe('applyExitTicketGradingWhenV2Enabled', () => {
  test('with the global flag off, keeps the stored four-band rubric intact', () => {
    const result = applyExitTicketGradingWhenV2Enabled(false, LEGACY_EXIT_TICKET_CONFIG);
    expect(result).toBe(LEGACY_EXIT_TICKET_CONFIG);
    expect(result.maxScore).toBe(100);
    expect(result.rubricCategories[0]?.bands).toHaveLength(2);
    if (result.instructions.mode !== 'unified') return;
    expect(result.instructions.gradingInstructions).toContain('Names it only');
  });

  test('with the global flag on, replaces instructions with the check assistant', () => {
    const result = applyExitTicketGradingWhenV2Enabled(
      true,
      LEGACY_EXIT_TICKET_CONFIG,
      {
        config: {
          schemaVersion: 1,
          mode: 'specific',
          kind: 'check',
          focus: 'explain-concept',
          topic: 'Holden',
          answerType: 'objective',
          correctAnswer: 'He is unreliable.',
        },
        studentPrompt: 'Explain Holden.',
        pointValue: 5,
        submitForGrade: true,
      }
    );

    expect(result.maxScore).toBe(5);
    expect(result.rubricCategories[0]?.bands).toBeUndefined();
    if (result.instructions.mode !== 'unified') return;
    expect(result.instructions.gradingInstructions).toContain(
      EXIT_TICKET_PART_B_CHECK
    );
    expect(result.instructions.gradingInstructions).not.toContain(
      'Names it only'
    );
    expect(result.promptConfigSnapshot.gradingInstructionsOverride).toBeNull();
  });

  test('with the global flag on, uses the reflection assistant for basic tickets', () => {
    const result = applyExitTicketGradingWhenV2Enabled(
      true,
      LEGACY_EXIT_TICKET_CONFIG,
      {
        config: { schemaVersion: 1, mode: 'basic', kind: 'reflection' },
        pointValue: null,
        submitForGrade: false,
      }
    );
    if (result.instructions.mode !== 'unified') return;
    expect(result.instructions.gradingInstructions).toContain(
      EXIT_TICKET_PART_A_REFLECTION
    );
    expect(result.maxScore).toBe(5);
  });

  test('does not touch non-exit-ticket assignment types', () => {
    const dailyPages = {
      ...LEGACY_EXIT_TICKET_CONFIG,
      assignmentTypeKind: 'daily_pages',
    };
    expect(applyExitTicketGradingWhenV2Enabled(true, dailyPages)).toBe(
      dailyPages
    );
  });
});