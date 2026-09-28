import { describe, expect, test } from 'bun:test';

import {
  buildFallbackPracticeFeedback,
  detectPracticeGuardrail,
  practiceFeedbackSchema,
  practiceFeedbackStatusLabel,
  type PracticeFeedbackInput,
} from './practice-feedback.shared';

const baseInput: PracticeFeedbackInput = {
  lessonTitle: 'Fixing Comma Splices',
  skill: 'comma splices',
  rule: 'A comma splice joins two independent clauses with only a comma.',
  exercise:
    'The new phone costs over a thousand dollars, most students can’t afford it.',
  instruction: 'Fix this comma splice using any method you prefer.',
  response:
    'The new phone costs over a thousand dollars; most students can’t afford it.',
};

describe('detectPracticeGuardrail', () => {
  test('flags an empty response without calling the tutor', () => {
    const result = detectPracticeGuardrail({
      exercise: baseInput.exercise,
      response: '   ',
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('needs_revision');
    expect(result?.summary).toContain('Add your revision');
  });

  test('flags a response identical to the prompt (ignoring whitespace/case)', () => {
    const result = detectPracticeGuardrail({
      exercise: baseInput.exercise,
      response: `  ${baseInput.exercise.toUpperCase()}  `,
    });

    expect(result).not.toBeNull();
    expect(result?.status).toBe('needs_revision');
    expect(result?.summary).toContain('still the original sentence');
  });

  test('returns null for a genuine revision', () => {
    expect(
      detectPracticeGuardrail({
        exercise: baseInput.exercise,
        response: baseInput.response,
      })
    ).toBeNull();
  });
});

describe('buildFallbackPracticeFeedback', () => {
  test('produces schema-valid feedback that never implies the answer was right', () => {
    // This path cannot tell a correct revision from an incorrect one. It used
    // to answer a wrong revision with "developing" and a strength of "you
    // revised the sentence", which read to students as a pass.
    const feedback = buildFallbackPracticeFeedback(baseInput);

    expect(() => practiceFeedbackSchema.parse(feedback)).not.toThrow();
    expect(feedback.strengths).toHaveLength(0);
    expect(feedback.status).toBe('needs_revision');
    expect(feedback.summary.toLowerCase()).toContain(
      'checked whether it is correct'
    );
    expect(feedback.focus.join(' ')).toContain('comma splices');
  });

  test('gives an incorrect revision no more credit than a correct one', () => {
    // The fallback is blind to correctness, so both must land in the same
    // unevaluated state — never a verdict on one and not the other.
    const correct = buildFallbackPracticeFeedback(baseInput);
    const incorrect = buildFallbackPracticeFeedback({
      ...baseInput,
      response:
        'The new phone costs over a thousand dollars, most students can’t afford it either.',
    });

    expect(incorrect.status).toBe(correct.status);
    expect(incorrect.strengths).toEqual(correct.strengths);
  });

  test('never counts as mastery in assigned practice', () => {
    // Assigned composition problems are mastered only on a `strong` verdict.
    // An unevaluated attempt must not clear that bar.
    expect(buildFallbackPracticeFeedback(baseInput).status).not.toBe('strong');
  });

  test('defers to guardrails for an empty response', () => {
    const feedback = buildFallbackPracticeFeedback({
      ...baseInput,
      response: '',
    });

    expect(feedback.status).toBe('needs_revision');
    expect(feedback.strengths).toHaveLength(0);
  });
});

describe('practiceFeedbackStatusLabel', () => {
  test('maps every status to a human label', () => {
    expect(practiceFeedbackStatusLabel('strong')).toBe('Strong work');
    expect(practiceFeedbackStatusLabel('developing')).toBe('Coming along');
    expect(practiceFeedbackStatusLabel('needs_revision')).toBe('Keep revising');
  });
});
