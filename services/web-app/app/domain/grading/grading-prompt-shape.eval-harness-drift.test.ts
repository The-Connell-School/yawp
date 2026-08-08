import { describe, expect, test } from 'bun:test';
import { buildGradingPromptShape } from './grading-prompt-shape';
import { buildGradingSystemBase } from '../../../../../scripts/ai-redaction-eval/prompt';
import {
  rubricCategories,
  DEFAULT_MIN_SCORE,
  DEFAULT_MAX_SCORE,
} from '../../../../../scripts/ai-redaction-eval/rubric';

/**
 * The PII redaction eval harness (scripts/ai-redaction-eval) reproduces the
 * grading prompt as literal template strings rather than importing the
 * route's builder, because the builder used to live inside the route
 * action. It has since been extracted into `buildGradingPromptShape`, so
 * the two can now be compared directly - and must be, or the eval silently
 * starts measuring a prompt the app no longer sends.
 *
 * If this fails, update scripts/ai-redaction-eval/prompt.ts to match, then
 * re-run the eval before trusting its report.
 */
describe('ai-redaction-eval harness prompt vs. the real derived shape', () => {
  test('the harness system base is byte-identical to the derived system prompt', () => {
    const shape = buildGradingPromptShape({
      categories: [...rubricCategories],
      minScore: DEFAULT_MIN_SCORE,
      maxScore: DEFAULT_MAX_SCORE,
      studentFirstName: 'Taylor',
    });

    expect(buildGradingSystemBase('Taylor')).toBe(shape.systemPrompt);
  });
});
