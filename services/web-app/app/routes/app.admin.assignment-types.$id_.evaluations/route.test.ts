import { describe, expect, test } from 'bun:test';

const { loader: routeLoader } = await import('./route');
const loader = routeLoader as any;

describe('admin assignment type evaluations redirect stub', () => {
  test('redirects to the renamed prompt route', async () => {
    await expect(
      loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/at-1/evaluations'
        ),
        params: { id: 'at-1' },
        context: {} as never,
      })
    ).rejects.toMatchObject({
      status: 302,
      headers: expect.any(Headers),
    });

    try {
      await loader({
        request: new Request(
          'https://example.test/app/admin/assignment-types/at-1/evaluations'
        ),
        params: { id: 'at-1' },
        context: {} as never,
      });
    } catch (response) {
      expect((response as Response).headers.get('Location')).toBe(
        '/app/admin/assignment-types/at-1/prompt'
      );
    }
  });
});
