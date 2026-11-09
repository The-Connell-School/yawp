import { expect, mock, test } from 'bun:test';
const logout = mock(async (options: { redirectTo: string }) => {
  throw new Response(null, {
    status: 302,
    headers: { Location: options.redirectTo },
  });
});
mock.module('~/utils/auth.server.ts', () => ({ logout }));
const { action } = await import('./route');
async function run(value?: string) {
  try {
    await action({
      request: new Request(
        `http://localhost/auth/logout${value === undefined ? '' : `?redirectTo=${encodeURIComponent(value)}`}`,
        { method: 'POST' }
      ),
      params: {},
      context: {},
    } as Parameters<typeof action>[0]);
    throw new Error('Expected logout redirect');
  } catch (response) {
    if (!(response instanceof Response)) throw response;
    return response.headers.get('Location');
  }
}

test('accepts only /free as a post-logout destination', async () => {
  expect(await run('/free')).toBe('/free');
  for (const destination of [
    'https://evil.test',
    '//evil.test',
    '/app',
    '/free?next=evil',
    '/free/',
  ]) {
    expect(await run(destination)).toBe('/auth/login');
  }
  expect(await run()).toBe('/auth/login');
  expect(logout).toHaveBeenCalled();
});
