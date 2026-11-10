import { describe, expect, test } from 'bun:test';

const { action } = await import('./route');

describe('api.guided-tours', () => {
  test('returns 404 after feature removal', async () => {
    const response = await action({
      request: new Request('https://example.com/api/guided-tours', {
        method: 'POST',
      }),
    } as any);
    expect(response.status).toBe(404);
  });
});
