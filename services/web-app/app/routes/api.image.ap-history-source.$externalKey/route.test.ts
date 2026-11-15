import { describe, expect, test } from 'bun:test';

const { loader } = await import('./route');

describe('api.image.ap-history-source.$externalKey', () => {
  test('is retired with 404', async () => {
    await expect(
      loader({
        params: { externalKey: 'source-1' },
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });
});