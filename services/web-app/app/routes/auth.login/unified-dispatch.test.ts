import { beforeEach, expect, mock, test } from 'bun:test';

const requireAnonymous = mock(async (_request: Request) => {});
const loginAction = mock(async (_args: unknown) => new Response('legacy'));
const findUnique = mock(
  async (_args: unknown): Promise<{ value: string } | null> => null
);
mock.module('~/utils/auth.server', () => ({ requireAnonymous }));
mock.module('./login.server', () => ({ loginAction }));
mock.module('~/utils/db.server', () => ({
  prisma: { setting: { findUnique } },
}));
mock.module('~/components/login-form', () => ({ LoginForm: () => null }));
mock.module('~/components/error-boundary', () => ({
  GeneralErrorBoundary: () => null,
}));
mock.module('~/components/unified-signon/unified-login', () => ({
  UnifiedLogin: () => null,
}));
const unifiedAction = mock(async (_request: Request, _values: unknown) =>
  Response.json({ state: { screen: 'account-type', flowToken: 'server-flow' } })
);
mock.module('~/domain/unified-signon/backend.server', () => ({
  unifiedAction,
}));
const { loader, action } = await import('./route');

beforeEach(() => {
  requireAnonymous.mockClear();
  loginAction.mockClear();
  findUnique.mockReset();
  findUnique.mockResolvedValue(null);
});

const args = (request: Request) =>
  ({ request, params: {}, context: {} }) as any;
for (const value of [
  null,
  '',
  'garbage',
  'false',
  '{"mode":"off"}',
  '{"mode":"targeted","orgIds":["demo"]}',
  '{"mode":true}',
  '{"mode":"everyone","orgIds":false}',
  '{"mode":"everyone","orgIds":[1]}',
]) {
  test(`flag ${String(value)} keeps legacy loader and POST dispatch`, async () => {
    findUnique.mockResolvedValue(value === null ? null : { value });
    expect(
      await loader(
        args(
          new Request(
            'http://localhost/auth/login?screen=joined&fixture=success'
          )
        )
      )
    ).toBeNull();
    const body = new URLSearchParams({
      intent: 'resolve',
      identifier: 'ENG-11X',
    });
    const request = new Request('http://localhost/auth/login', {
      method: 'POST',
      body,
    });
    const result = await action(args(request));
    expect(await (result as Response).text()).toBe('legacy');
    expect(loginAction).toHaveBeenCalledWith(
      expect.objectContaining({ request })
    );
    expect(request.bodyUsed).toBe(false);
  });
}

test('flag read failure retains legacy entry', async () => {
  findUnique.mockRejectedValue(new Error('offline'));
  expect(
    await loader(args(new Request('http://localhost/auth/login')))
  ).toBeNull();
});

test('anonymous guard runs before enabled UI dispatch', async () => {
  requireAnonymous.mockRejectedValueOnce(
    new Response(null, { status: 302, headers: { Location: '/app' } })
  );
  await expect(
    loader(args(new Request('http://localhost/auth/login')))
  ).rejects.toMatchObject({ status: 302 });
  expect(findUnique).not.toHaveBeenCalled();
});

test('enabled entry sanitizes redirect and never exposes fixture selectors or Google', async () => {
  findUnique.mockResolvedValue({ value: '{"mode":"everyone","orgIds":[]}' });
  const result = await loader(
    args(
      new Request(
        'http://localhost/auth/login?redirectTo=https://evil.example&screen=joined'
      )
    )
  );
  expect(result).toEqual({
    unified: true,
    redirectTo: '/app',
    googleAvailable: false,
  });
});

test('signed-in entry retains the legacy destination off and uses app only on', async () => {
  for (const enabled of [false, true]) {
    findUnique.mockResolvedValue(enabled ? { value: 'true' } : null);
    requireAnonymous.mockRejectedValueOnce(
      new Response(null, { status: 302, headers: { Location: '/' } })
    );
    try {
      await loader(args(new Request('http://localhost/auth/login')));
      throw new Error('Expected authenticated entry to redirect');
    } catch (response) {
      expect((response as Response).headers.get('Location')).toBe(
        enabled ? '/app' : '/'
      );
    }
  }
});

test('enabled resolver delegates fields to the authoritative backend', async () => {
  findUnique.mockResolvedValue({ value: 'true' });
  const result = await action(
    args(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        body: new URLSearchParams({
          intent: 'resolve',
          identifier: 'maya@example.com',
        }),
      })
    )
  );
  expect(result).toMatchObject({ status: 200 });
  expect(await (result as Response).json()).toEqual({
    state: { screen: 'account-type', flowToken: 'server-flow' },
  });
  expect(unifiedAction).toHaveBeenCalledWith(
    expect.any(Request),
    expect.objectContaining({
      intent: 'resolve',
      identifier: 'maya@example.com',
    })
  );
  expect(loginAction).not.toHaveBeenCalled();
  expect((result as Response).headers.has('set-cookie')).toBe(false);
});

test('enabled password submission delegates unchanged to existing action', async () => {
  findUnique.mockResolvedValue({ value: 'true' });
  const request = new Request('http://localhost/auth/login', {
    method: 'POST',
    body: new URLSearchParams({
      intent: 'password',
      email: 'maya@example.com',
      password: 'secret',
    }),
  });
  await action(args(request));
  expect(loginAction).toHaveBeenCalledWith(
    expect.objectContaining({ request })
  );
  expect(request.bodyUsed).toBe(false);
});
