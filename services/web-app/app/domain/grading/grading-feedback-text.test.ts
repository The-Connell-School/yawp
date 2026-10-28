import { describe, expect, test } from 'bun:test';
import { hasMeaningfulGradingFeedbackText } from './grading-feedback-text';

describe('hasMeaningfulGradingFeedbackText', () => {
  test('is false for empty, whitespace, and empty rich-text shells', () => {
    expect(hasMeaningfulGradingFeedbackText('')).toBe(false);
    expect(hasMeaningfulGradingFeedbackText('   ')).toBe(false);
    expect(hasMeaningfulGradingFeedbackText('<p></p>')).toBe(false);
    expect(hasMeaningfulGradingFeedbackText('<p>&nbsp;</p>')).toBe(false);
  });

  test('is true when visible characters remain after stripping markup', () => {
    expect(hasMeaningfulGradingFeedbackText('Nice work.')).toBe(true);
    expect(hasMeaningfulGradingFeedbackText('<p>Nice work.</p>')).toBe(true);
  });
});
