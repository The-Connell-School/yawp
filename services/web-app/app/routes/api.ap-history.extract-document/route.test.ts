import { describe, expect, test } from 'bun:test';

const { action } = await import('./route');

describe('api.ap-history.extract-document', () => {
  test('is retired with 404', async () => {
    await expect(
      action({
        request: new Request('https://example.com/api/ap-history/extract-document', {
          method: 'POST',
        }),
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });
});