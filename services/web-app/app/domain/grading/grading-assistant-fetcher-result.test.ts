import { describe, expect, test } from 'bun:test';
import {
  getGradingAssistantFetcherErrorMessage,
  gradingAssistantResponseHasVisibleContent,
} from './grading-assistant-fetcher-result';

describe('getGradingAssistantFetcherErrorMessage', () => {
  test('returns null for retry and success payloads', () => {
    expect(getGradingAssistantFetcherErrorMessage({ retrying: true })).toBeNull();
    expect(
      getGradingAssistantFetcherErrorMessage({
        success: true,
        overallComment: 'Feedback',
      })
    ).toBeNull();
  });

  test('surfaces server messages and falls back when missing', () => {
    expect(
      getGradingAssistantFetcherErrorMessage({
        success: false,
        message: 'Grading took too long. Please try again.',
      })
    ).toBe('Grading took too long. Please try again.');
    expect(getGradingAssistantFetcherErrorMessage({ success: false })).toBe(
      'Grading Assistant could not generate suggestions. Please try again.'
    );
  });
});

describe('gradingAssistantResponseHasVisibleContent', () => {
  test('detects comments, scores, and rubric entries', () => {
    expect(
      gradingAssistantResponseHasVisibleContent({
        success: true,
        overallComment: 'Strong thesis.',
      })
    ).toBe(true);
    expect(
      gradingAssistantResponseHasVisibleContent({
        success: true,
        rubricScores: { thesis: { score: 3, comment: '' } },
      })
    ).toBe(true);
  });

  test('treats grammar issue objects as visible content', () => {
    expect(
      gradingAssistantResponseHasVisibleContent({
        success: true,
        grammarIssues: {
          version: 1,
          issues: [{ excerpt: 'Their going', message: 'Use they are.' }],
        },
      })
    ).toBe(true);
  });

  test('is false for an empty success payload', () => {
    expect(
      gradingAssistantResponseHasVisibleContent({
        success: true,
        overallComment: '',
        rubricScores: { thesis: { score: 0, comment: '' } },
      })
    ).toBe(false);
  });
});
