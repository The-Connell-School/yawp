import { expect, mock, test } from 'bun:test';

const logout = mock(async (options: { redirectTo: string }) => {
  throw new Response(null, {
    status: 302,
    headers: { Location: options.redirectTo },
  });
});

mock.module('~/utils/auth.server.ts', () => ({ logout }));

test('GET /auth/logout ends the session instead of an unexpected server error', async () => {
  const { loader } = await import('./route');
  expect(loader).toBeDefined();

  try {
    await loader!({
      request: new Request('http://localhost/auth/logout', { method: 'GET' }),
      params: {},
      context: {},
    } as Parameters<NonNullable<typeof loader>>[0]);
    throw new Error('Expected logout redirect');
  } catch (response) {
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('Location')).toBe('/auth/login');
  }

  expect(logout).toHaveBeenCalledWith(
    expect.objectContaining({ redirectTo: '/auth/login' })
  );
});
