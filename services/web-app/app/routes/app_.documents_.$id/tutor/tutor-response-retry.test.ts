import { describe, expect, mock, test } from 'bun:test';
import { postTutorResponseWithFallbackRetry } from './tutor-response-retry';

function formEntries(formData: FormData) {
  return Object.fromEntries(
    [...formData.entries()].map(([key, value]) => [key, String(value)])
  );
}

describe('postTutorResponseWithFallbackRetry', () => {
  test('resubmits once with llmRetry=fallback after a 202 retry signal', async () => {
    const fetcher = mock()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ retrying: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ cms: { id: 'cms-1' } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    const onRetry = mock();
    const formData = new FormData();
    formData.set('response', 'Can you review this?');
    formData.set('cmsId', 'cms-1');
    formData.set('content', 'Current draft');

    const result = await postTutorResponseWithFallbackRetry({
      fetcher: fetcher as unknown as typeof fetch,
      formData,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(formEntries(fetcher.mock.calls[0]?.[1]?.body as FormData)).toEqual({
      response: 'Can you review this?',
      cmsId: 'cms-1',
      content: 'Current draft',
    });
    expect(formEntries(fetcher.mock.calls[1]?.[1]?.body as FormData)).toEqual({
      response: 'Can you review this?',
      cmsId: 'cms-1',
      content: 'Current draft',
      llmRetry: 'fallback',
    });
    expect(result.json).toEqual({ cms: { id: 'cms-1' } });
    expect(result.response.status).toBe(200);
  });

  test('does not retry normal failures', async () => {
    const fetcher = mock().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Nope' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const onRetry = mock();
    const formData = new FormData();
    formData.set('response', 'Can you review this?');
    formData.set('cmsId', 'cms-1');

    const result = await postTutorResponseWithFallbackRetry({
      fetcher: fetcher as unknown as typeof fetch,
      formData,
      onRetry,
    });

    expect(onRetry).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.json).toEqual({ error: 'Nope' });
    expect(result.response.status).toBe(500);
  });
});
