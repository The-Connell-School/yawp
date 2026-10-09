import { describe, expect, test } from 'bun:test';
import {
  LlmFallbackRetrySignal,
  describeProviderError,
  getAnthropicRetryableStatus,
  isLlmFallbackRetrySignal,
  isProviderConfigurationError,
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

/**
 * A failed model call is the one thing an operator has to be able to read off
 * a log line: a wrong key, a wrong model name, and a rate limit all look the
 * same from the outside, and only one of them is worth retrying.
 */
describe('describeProviderError', () => {
  test('reads an Anthropic error envelope', () => {
    expect(
      describeProviderError({
        name: 'AuthenticationError',
        status: 401,
        error: {
          type: 'error',
          error: { type: 'authentication_error', message: 'invalid x-api-key' },
        },
      })
    ).toBe('AuthenticationError · authentication_error · HTTP 401');
  });

  test('reads an OpenAI error envelope', () => {
    expect(
      describeProviderError({
        name: 'NotFoundError',
        status: 404,
        error: { type: 'invalid_request_error', code: 'model_not_found' },
      })
    ).toBe('NotFoundError · invalid_request_error · HTTP 404');
  });

  test('names a deadline that ran out, which carries no status at all', () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    expect(describeProviderError(timeout)).toBe('TimeoutError');
  });

  /**
   * The description goes into a log row that is deliberately kept free of
   * teacher and student words. Provider messages can quote the prompt back,
   * so the message body is the one part that never travels.
   */
  test('never carries the provider message body', () => {
    const described = describeProviderError({
      name: 'BadRequestError',
      status: 400,
      message: 'prompt is too long: "my third period cannot write a thesis"',
      error: { type: 'invalid_request_error' },
    });
    expect(described).not.toContain('third period');
    expect(described).toBe(
      'BadRequestError · invalid_request_error · HTTP 400'
    );
  });

  test('says something useful about an error it cannot read', () => {
    expect(describeProviderError(undefined)).toBe('unknown error');
    expect(describeProviderError('exploded')).toBe('unknown error');
  });
});

describe('isProviderConfigurationError', () => {
  /**
   * These are the failures where "please try again" is a lie: the same request
   * will fail the same way until someone changes an environment variable.
   */
  test('is true for a rejected key, a forbidden key, and a model that is not there', () => {
    expect(isProviderConfigurationError({ status: 401 })).toBe(true);
    expect(isProviderConfigurationError({ status: 403 })).toBe(true);
    expect(isProviderConfigurationError({ status: 404 })).toBe(true);
    expect(
      isProviderConfigurationError({
        error: { error: { type: 'authentication_error' } },
      })
    ).toBe(true);
  });

  test('is false for an overloaded provider, a rate limit, or a timeout', () => {
    expect(isProviderConfigurationError({ status: 529 })).toBe(false);
    expect(isProviderConfigurationError({ status: 429 })).toBe(false);
    expect(isProviderConfigurationError({ status: 500 })).toBe(false);
    expect(isProviderConfigurationError(new Error('aborted'))).toBe(false);
  });
});
