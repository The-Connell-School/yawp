import { describe, expect, mock, test } from 'bun:test';
import { postTutorResponse } from './tutor-response-retry';

function formEntries(formData: FormData) {
  return Object.fromEntries([...formData.entries()].map(([key, value]) => [
    key,
    String(value),
  ]));
}

describe('postTutorResponse', () => {
  test('posts once and returns the parsed JSON response', async () => {
    const fetcher = mock().mockResolvedValueOnce(
      new Response(JSON.stringify({ cms: { id: 'cms-1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const formData = new FormData();
    formData.set('response', 'Can you review this?');
    formData.set('cmsId', 'cms-1');
    formData.set('content', 'Current draft');

    const result = await postTutorResponse({
      fetcher: fetcher as unknown as typeof fetch,
      formData,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(formEntries(fetcher.mock.calls[0]?.[1]?.body as FormData)).toEqual({
      response: 'Can you review this?',
      cmsId: 'cms-1',
      content: 'Current draft',
    });
    expect(result.json).toEqual({ cms: { id: 'cms-1' } });
    expect(result.response.status).toBe(200);
  });

  test('never retries - a 202 "retrying" response is just returned as-is', async () => {
    // The server can no longer emit this response for the tutor
    // (allowFallbackProvider: false removed the only thing it signaled),
    // but if it ever did, there is nothing here that would resubmit.
    const fetcher = mock().mockResolvedValueOnce(
      new Response(JSON.stringify({ retrying: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const formData = new FormData();
    formData.set('response', 'Can you review this?');
    formData.set('cmsId', 'cms-1');

    const result = await postTutorResponse({
      fetcher: fetcher as unknown as typeof fetch,
      formData,
    });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result.json).toEqual({ retrying: true });
    expect(result.response.status).toBe(202);
  });
});
