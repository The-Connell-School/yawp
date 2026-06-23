import { describe, expect, test } from 'bun:test';
import {
  LlmFallbackRetrySignal,
  getAnthropicRetryableStatus,
  isLlmFallbackRetrySignal,
  isRetryableAnthropicOutageError,
} from './llm-provider-errors.server';

describe('Anthropic outage error classification', () => {
  test('treats Anthropic 529, 500, 504, and overloaded_error as retryable', () => {
    expect(isRetryableAnthropicOutageError({ status: 529 })).toBe(true);
    expect(isRetryableAnthropicOutageError({ status: 500 })).toBe(true);
    expect(isRetryableAnthropicOutageError({ status: 504 })).toBe(true);
    expect(
      isRetryableAnthropicOutageError({
        error: { type: 'overloaded_error', message: 'Overloaded' },
      })
    ).toBe(true);
    expect(
      isRetryableAnthropicOutageError(
        new Error('Anthropic overloaded_error: Overloaded')
      )
    ).toBe(true);
  });

  test('does not retry auth, model, validation, or rate-limit failures', () => {
    expect(isRetryableAnthropicOutageError({ status: 400 })).toBe(false);
    expect(isRetryableAnthropicOutageError({ status: 401 })).toBe(false);
    expect(isRetryableAnthropicOutageError({ status: 403 })).toBe(false);
    expect(isRetryableAnthropicOutageError({ status: 404 })).toBe(false);
    expect(isRetryableAnthropicOutageError({ status: 429 })).toBe(false);
  });

  test('extracts retryable status when one is available', () => {
    expect(getAnthropicRetryableStatus({ status: 529 })).toBe(529);
    expect(getAnthropicRetryableStatus({ statusCode: 504 })).toBe(504);
    expect(getAnthropicRetryableStatus({ status: 429 })).toBeNull();
  });

  test('identifies fallback retry signals', () => {
    const signal = new LlmFallbackRetrySignal({
      reason: 'status:529',
      retryableStatus: 529,
      fallbackModel: 'gpt-4o-mini',
    });

    expect(isLlmFallbackRetrySignal(signal)).toBe(true);
    expect(isLlmFallbackRetrySignal(new Error('nope'))).toBe(false);
    expect(signal.retryableStatus).toBe(529);
    expect(signal.fallbackModel).toBe('gpt-4o-mini');
  });
});
