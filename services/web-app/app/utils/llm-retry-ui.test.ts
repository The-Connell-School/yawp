import { describe, expect, mock, test } from 'bun:test';
import {
  cloneFormDataWithFallbackRetry,
  isLlmRetryResponse,
  postFormWithFallbackRetry,
} from './llm-retry-ui';

function formEntries(formData: FormData) {
  return Object.fromEntries([...formData.entries()].map(([key, value]) => [
    key,
    String(value),
  ]));
}

describe('LLM retry UI helpers', () => {
  test('recognizes retry payloads', () => {
    expect(isLlmRetryResponse({ retrying: true })).toBe(true);
    expect(isLlmRetryResponse({ retrying: false })).toBe(false);
    expect(isLlmRetryResponse({ success: true })).toBe(false);
  });

  test('clones form data and sets llmRetry=fallback', () => {
    const formData = new FormData();
    formData.set('submissionId', 'sub-1');

    const retryForm = cloneFormDataWithFallbackRetry(formData);

    expect(formEntries(retryForm)).toEqual({
      submissionId: 'sub-1',
      llmRetry: 'fallback',
    });
    expect(formEntries(formData)).toEqual({ submissionId: 'sub-1' });
  });

  test('posts a fallback retry after a 202 retry response', async () => {
    const fetcher = mock()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retrying: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    const onRetry = mock();
    const formData = new FormData();
    formData.set('submissionId', 'sub-1');

    const result = await postFormWithFallbackRetry({
      fetcher: fetcher as unknown as typeof fetch,
      action: '/api/domain/grade-essay-ai',
      formData,
      onRetry,
    });

    expect(result.response.status).toBe(200);
    expect(result.json).toEqual({ success: true });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(formEntries(fetcher.mock.calls[1]?.[1]?.body as FormData)).toEqual({
      submissionId: 'sub-1',
      llmRetry: 'fallback',
    });
  });
});
