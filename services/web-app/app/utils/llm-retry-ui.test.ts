import { describe, expect, mock, test } from 'bun:test';
import { postJsonForm } from './llm-retry-ui';

describe('postJsonForm', () => {
  test('posts the form data once and returns the parsed JSON response', async () => {
    const fetcher = mock().mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const formData = new FormData();
    formData.set('submissionId', 'sub-1');

    const result = await postJsonForm({
      fetcher: fetcher as unknown as typeof fetch,
      action: '/api/domain/grade-essay-ai',
      formData,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/domain/grade-essay-ai', {
      method: 'POST',
      body: formData,
    });
    expect(result.response.status).toBe(200);
    expect(result.json).toEqual({ success: true });
  });

  test('never retries - a 202 "retrying" response is just returned as-is', async () => {
    // The server can no longer emit this response for grading/tutor
    // (allowFallbackProvider: false removed the only thing it signaled),
    // but if it ever did, there is nothing here that would resubmit.
    const fetcher = mock().mockResolvedValueOnce(
      new Response(JSON.stringify({ retrying: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const formData = new FormData();

    const result = await postJsonForm({
      fetcher: fetcher as unknown as typeof fetch,
      action: '/api/domain/grade-essay-ai',
      formData,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.response.status).toBe(202);
    expect(result.json).toEqual({ retrying: true });
  });
});
