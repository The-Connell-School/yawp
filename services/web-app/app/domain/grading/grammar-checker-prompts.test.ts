import { describe, expect, test } from 'bun:test';

import {
  buildGrammarCheckerRetryUserPrompt,
  buildGrammarCheckerSystemPrompt,
  buildGrammarCheckerUserPrompt,
} from './grammar-checker-prompts';

/**
 * Daily Pages writing time was removed (never released), so the grammar
 * checker always reads the writing as untimed: these are the prompts every
 * school has been graded with.
 */
describe('buildGrammarCheckerSystemPrompt', () => {
  test('is the checker prompt, with no writing time', () => {
    const prompt = buildGrammarCheckerSystemPrompt();
    expect(prompt.startsWith('You are the Grammar/Usage Checker.')).toBe(true);
    expect(prompt.endsWith('Style:\n(10) Omit needless words.')).toBe(true);
    expect(prompt).not.toContain('Writing time');
  });
});

describe('grammar checker user prompts', () => {
  test('ask for the issues in the essay, with no writing time', () => {
    expect(buildGrammarCheckerUserPrompt('Text.')).toBe(
      'Essay:\nText.\n\nReturn up to 15 issues.'
    );
    expect(buildGrammarCheckerRetryUserPrompt('Text.')).toBe(
      'Essay:\nText.\n\nReturn 8-12 issues using the exact schema. Do not include markdown.'
    );
  });
});
