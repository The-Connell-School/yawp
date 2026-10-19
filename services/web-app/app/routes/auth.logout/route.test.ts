import { expect, mock, test } from 'bun:test';
let enabled = false;
const logout = mock(async (options: { redirectTo: string }) => {
  throw new Response(null, {
    status: 302,
    headers: { Location: options.redirectTo },
  });
});
mock.module('~/utils/auth.server.ts', () => ({ logout }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => enabled,
}));
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

test('flag off preserves the normal logout redirect including supplied /free', async () => {
  enabled = false;
  expect(await run('/free')).toBe('/auth/login');
  expect(await run()).toBe('/auth/login');
});
test('flag on accepts only /free and always calls the normal logout', async () => {
  enabled = true;
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
  expect(logout).toHaveBeenCalled();
});
