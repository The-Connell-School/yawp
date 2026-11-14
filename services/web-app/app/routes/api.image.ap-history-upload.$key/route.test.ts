import { describe, expect, test } from 'bun:test';

const { loader } = await import('./route');

describe('api.image.ap-history-upload.$key', () => {
  test('is retired with 404', async () => {
    await expect(
      loader({
        params: { key: 'upload-key-1' },
      } as never)
    ).rejects.toMatchObject({ status: 404 });
  });
});