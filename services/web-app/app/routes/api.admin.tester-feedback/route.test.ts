import { describe, expect, test } from 'bun:test';
import { loader } from './route';

function loaderArgs(url: string) {
  return {
    request: new Request(url),
    params: {},
    context: {},
    url: new URL(url),
    pattern: '/api/admin/tester-feedback',
  };
}

describe('legacy tester feedback admin API', () => {
  test('is deprecated and does not list feedback', async () => {
    const response = await loader(
      loaderArgs(
        'https://demo.example/api/admin/tester-feedback?environment=demo'
      )
    );

    expect(response.status).toBe(410);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error:
        'Tester feedback review has moved to Yawp Internal. This platform API no longer lists or exports feedback.',
    });
  });

  test('is deprecated and does not export CSV', async () => {
    const response = await loader(
      loaderArgs('https://demo.example/api/admin/tester-feedback?format=csv')
    );

    expect(response.status).toBe(410);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toBeNull();
  });
});
