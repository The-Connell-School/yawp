import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
mock.module('~/utils/auth.server', () => ({ requireAdmin }));

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
  beforeEach(() => {
    requireAdmin.mockReset();
    requireAdmin.mockResolvedValue({ id: 'admin-1' });
  });

  test('requires platform admin authorization before returning the moved response', async () => {
    const denied = new Response('Forbidden', { status: 403 });
    requireAdmin.mockRejectedValueOnce(denied);

    await expect(
      loader(
        loaderArgs(
          'https://demo.example/api/admin/tester-feedback?environment=demo'
        ) as never
      )
    ).rejects.toBe(denied);

    expect(requireAdmin).toHaveBeenCalledTimes(1);
  });

  test('is deprecated and does not list feedback', async () => {
    const response = await loader(
      loaderArgs(
        'https://demo.example/api/admin/tester-feedback?environment=demo'
      ) as never
    );

    expect(response.status).toBe(410);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      error:
        'Tester feedback review has moved to Yawp! Internal. This platform API no longer lists or exports feedback.',
    });
  });

  test('is deprecated and does not export CSV', async () => {
    const response = await loader(
      loaderArgs('https://demo.example/api/admin/tester-feedback?format=csv') as never
    );

    expect(response.status).toBe(410);
    expect(requireAdmin).toHaveBeenCalledTimes(1);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toBeNull();
  });
});
