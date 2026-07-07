import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { PracticeFeedbackInput } from './practice-feedback.shared';

const getLLMCompletion = mock();

mock.module('~/utils/getLLMCompletion', () => ({
  AgentType: { Assistant: 'assistant', User: 'user' },
  getLLMCompletion,
}));

const { generatePracticeFeedback } = await import('./practice-feedback.server');

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

const originalKey = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  getLLMCompletion.mockReset();
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

afterEach(() => {
  if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalKey;
});

describe('generatePracticeFeedback', () => {
  test('returns validated AI feedback when the tutor responds with valid JSON', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: 'strong',
        summary: 'You fixed the splice cleanly with a semicolon.',
        strengths: ['The semicolon joins two closely related clauses.'],
        focus: ['Double-check both sides can stand alone as sentences.'],
        encouragement: 'Nice control — keep it up.',
      })
    );

    const result = await generatePracticeFeedback(baseInput);

    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(result.degraded).toBe(false);
    expect(result.status).toBe('strong');
    expect(result.strengths[0]).toContain('semicolon');
  });

  test('passes the skill and rule to the tutor as grounding', async () => {
    getLLMCompletion.mockResolvedValueOnce(
      JSON.stringify({
        status: 'developing',
        summary: 'Good direction.',
        strengths: ['You made an edit.'],
        focus: ['Reconsider the join.'],
        encouragement: 'Keep going.',
      })
    );

    await generatePracticeFeedback(baseInput);

    const callArgs = getLLMCompletion.mock.calls[0][0];
    const serialized = JSON.stringify(callArgs);
    expect(serialized).toContain('comma splices');
    expect(serialized).toContain('two independent clauses');
    expect(callArgs.messages[0].content).toContain(baseInput.response);
  });

  test('short-circuits blank responses without calling the tutor', async () => {
    const result = await generatePracticeFeedback({
      ...baseInput,
      response: '',
    });

    expect(getLLMCompletion).not.toHaveBeenCalled();
    expect(result.degraded).toBe(false);
    expect(result.status).toBe('needs_revision');
  });

  test('still attempts the tutor even without an Anthropic key (provider fallback is getLLMCompletion’s job)', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    getLLMCompletion.mockRejectedValueOnce(new Error('no provider configured'));

    const result = await generatePracticeFeedback(baseInput);

    // We no longer short-circuit on a missing Anthropic key; we call through and
    // only fall back when the call actually fails.
    expect(getLLMCompletion).toHaveBeenCalledTimes(1);
    expect(result.degraded).toBe(true);
    expect(result.focus.join(' ')).toContain('comma splices');
  });

  test('falls back when the tutor returns unparseable output', async () => {
    getLLMCompletion.mockResolvedValueOnce('sorry, I could not help with that');

    const result = await generatePracticeFeedback(baseInput);

    expect(result.degraded).toBe(true);
    expect(result.status).toBe('developing');
  });

  test('falls back when the tutor call throws', async () => {
    getLLMCompletion.mockRejectedValueOnce(new Error('upstream 529'));

    const result = await generatePracticeFeedback(baseInput);

    expect(result.degraded).toBe(true);
  });
});
