import { afterEach, beforeEach, expect, mock, test } from 'bun:test';

const requireAnonymous = mock(async (_request: Request) => {});
const loginAction = mock(async (_args: unknown) => new Response('legacy'));
mock.module('~/utils/auth.server', () => ({
  requireAnonymous,
  requireMutableRequest: async () => {},
}));
mock.module('./login.server', () => ({ loginAction }));
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
  unifiedAction.mockReset();
  unifiedAction.mockImplementation(async () =>
    Response.json({
      state: { screen: 'account-type', flowToken: 'server-flow' },
    })
  );
  requireAnonymous.mockClear();
  loginAction.mockClear();
  process.env.YAWP_ENVIRONMENT = 'production';
});

const args = (request: Request) =>
  ({ request, params: {}, context: {} }) as any;

test('anonymous guard runs before entry dispatch', async () => {
  requireAnonymous.mockRejectedValueOnce(
    new Response(null, { status: 302, headers: { Location: '/app' } })
  );
  await expect(
    loader(args(new Request('http://localhost/auth/login')))
  ).rejects.toMatchObject({ status: 302 });
});

test('entry sanitizes redirect and never exposes fixture selectors or Google', async () => {
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
    googleVisible: true,
  });
});

test('a PR preview hides Google on an origin missing from its allowlist', async () => {
  process.env.YAWP_ENVIRONMENT = 'preview';
  process.env.GOOGLE_OAUTH_REQUIRE_ORIGIN_ALLOWLIST = 'true';
  process.env.GOOGLE_OAUTH_ORIGIN_ALLOWLIST = '';
  try {
    const result = await loader(
      args(new Request('https://pr-437.preview.yawp.school/auth/login'))
    );
    expect(result).toMatchObject({
      googleAvailable: false,
      googleVisible: false,
    });
  } finally {
    delete process.env.GOOGLE_OAUTH_REQUIRE_ORIGIN_ALLOWLIST;
    delete process.env.GOOGLE_OAUTH_ORIGIN_ALLOWLIST;
  }
});

test('signed-in entry redirects to the app', async () => {
  requireAnonymous.mockRejectedValueOnce(
    new Response(null, { status: 302, headers: { Location: '/' } })
  );
  try {
    await loader(args(new Request('http://localhost/auth/login')));
    throw new Error('Expected authenticated entry to redirect');
  } catch (response) {
    expect((response as Response).headers.get('Location')).toBe('/app');
  }
});

test('resolver delegates fields to the authoritative backend', async () => {
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

test('password submission delegates unchanged to existing action', async () => {
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

// The fast preview runtime is Vite over HTTP behind the TLS ingress. Its
// node-fetch-server adapter uses the socket protocol and Host (not XFP).
const deploymentEnv = {
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  PRIMARY_APP_URL: process.env.PRIMARY_APP_URL,
  GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
};
afterEach(() => {
  for (const [name, value] of Object.entries(deploymentEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});
const publicOrigin = 'https://pr-565.preview.yawp.school';
function proxyRequest(
  origin: string | null = publicOrigin,
  headers = {},
  host = 'pr-565.preview.yawp.school',
  intent = 'resolve'
) {
  return new Request(`http://${host}/auth/login.data`, {
    method: 'POST',
    headers: {
      host,
      'x-forwarded-host': host,
      'x-forwarded-proto': 'https',
      'x-forwarded-port': '443',
      ...(origin === null ? {} : { Origin: origin }),
      ...headers,
    },
    body: new URLSearchParams({ intent, identifier: 'DEV-CLASS-101' }),
  });
}
function enablePreview() {
  process.env.YAWP_ENVIRONMENT = 'preview';
  process.env.PRIMARY_APP_URL = publicOrigin;
}
for (const [intent, identifier] of [
  ['resolve', 'existing@example.test'],
  ['resolve', 'DEV-CLASS-101'],
  ['class-code', 'DEV-CLASS-101'],
  ['google', ''],
])
  test(`HTTPS preview ${intent} ${identifier} reaches the backend`, async () => {
    enablePreview();
    const request = proxyRequest(publicOrigin, {}, undefined, intent);
    const form = new URLSearchParams({ intent, identifier });
    const submitted = new Request(request, { body: form });
    const response = await action(args(submitted));
    expect((response as Response).status).toBe(200);
    expect(unifiedAction).toHaveBeenCalledTimes(1);
  });

test('preview Google start reaches the real unavailable-provider outcome without credentials', async () => {
  enablePreview();
  delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const { beginGoogle } = await import('~/domain/unified-signon/google.server');
  unifiedAction.mockImplementationOnce(async (request) => {
    beginGoogle({ data: {} } as any, request);
    throw new Error('Expected unavailable Google');
  });
  const response = (await action(
    args(proxyRequest(publicOrigin, {}, undefined, 'google'))
  )) as Response;
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: 'Google sign-in is unavailable. Use your email or class code.',
  });
});

for (const origin of [
  'https://evil.example',
  'http://pr-565.preview.yawp.school',
  'null',
  'garbage',
  `${publicOrigin}/path`,
  `${publicOrigin}, https://evil.example`,
  'https://pr-565.preview.yawp.school.evil.test',
]) {
  test(`preview rejects foreign or malformed Origin: ${origin}`, async () => {
    enablePreview();
    const response = (await action(args(proxyRequest(origin)))) as Response;
    expect(response.status).toBe(403);
    expect(unifiedAction).not.toHaveBeenCalled();
  });
}
for (const headers of [
  { 'x-forwarded-host': 'evil.example' },
  { 'x-forwarded-host': 'evil.example, pr-565.preview.yawp.school' },
  { 'x-forwarded-proto': 'https, http' },
  { 'x-forwarded-proto': 'javascript' },
  {
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'evil.example',
    Forwarded: 'host=evil.example;proto=https',
  },
])
  test(`forwarded headers cannot authorize an attacker: ${JSON.stringify(headers)}`, async () => {
    enablePreview();
    const response = (await action(
      args(proxyRequest('https://evil.example', headers))
    )) as Response;
    expect(response.status).toBe(403);
    expect(unifiedAction).not.toHaveBeenCalled();
  });

test('configured origin cannot authorize another request host', async () => {
  enablePreview();
  expect(
    (
      (await action(
        args(proxyRequest(publicOrigin, {}, 'pr-566.preview.yawp.school'))
      )) as Response
    ).status
  ).toBe(403);
});
test('production HTTP ingress accepts the configured public HTTPS Origin', async () => {
  process.env.YAWP_ENVIRONMENT = 'production';
  process.env.PRIMARY_APP_URL = 'https://yawp.school';
  const response = (await action(
    args(
      new Request('http://abc123.us-east-1.awsapprunner.com/auth/login.data', {
        method: 'POST',
        headers: {
          host: 'abc123.us-east-1.awsapprunner.com',
          Origin: 'https://yawp.school',
        },
        body: new URLSearchParams({
          intent: 'resolve',
          identifier: 'DEV-CLASS-101',
        }),
      })
    )
  )) as Response;
  expect(response.status).toBe(200);
  expect(unifiedAction).toHaveBeenCalled();
});

test('production HTTP ingress still rejects a foreign Origin', async () => {
  process.env.YAWP_ENVIRONMENT = 'production';
  process.env.PRIMARY_APP_URL = 'https://yawp.school';
  const response = (await action(
    args(
      new Request('http://yawp.school/auth/login.data', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: new URLSearchParams({
          intent: 'resolve',
          identifier: 'DEV-CLASS-101',
        }),
      })
    )
  )) as Response;
  expect(response.status).toBe(403);
  expect(unifiedAction).not.toHaveBeenCalled();
});

for (const environment of ['development', '']) {
  test(`non-preview preview-host proxy without preview env stays rejected: ${environment}`, async () => {
    process.env.YAWP_ENVIRONMENT = environment;
    process.env.PRIMARY_APP_URL = 'https://yawp.school';
    const response = (await action(
      args(
        proxyRequest('https://pr-565.preview.yawp.school', {}, 'pr-565.preview.yawp.school')
      )
    )) as Response;
    expect(response.status).toBe(403);
    expect(unifiedAction).not.toHaveBeenCalled();
  });
}
for (const configured of [
  undefined,
  'broken',
  'https://evil.example',
  'http://pr-565.preview.yawp.school',
  'https://user:password@pr-565.preview.yawp.school',
]) {
  test(`invalid or unrelated deployment URL does not widen origins: ${configured}`, async () => {
    enablePreview();
    if (configured === undefined) delete process.env.PRIMARY_APP_URL;
    else process.env.PRIMARY_APP_URL = configured;
    expect((await action(args(proxyRequest()))) as Response).toMatchObject({
      status: 403,
    });
  });
}

test('direct same-origin and missing-Origin behavior remain supported', async () => {
  enablePreview();
  for (const request of [
    proxyRequest(null),
    new Request(`${publicOrigin}/auth/login`, {
      method: 'POST',
      headers: { Origin: publicOrigin },
      body: new URLSearchParams({
        intent: 'resolve',
        identifier: 'local@example.test',
      }),
    }),
    new Request('http://localhost:5176/auth/login', {
      method: 'POST',
      headers: { Origin: 'http://localhost:5176' },
      body: new URLSearchParams({
        intent: 'resolve',
        identifier: 'local@example.test',
      }),
    }),
  ]) {
    expect((await action(args(request))) as Response).toMatchObject({
      status: 200,
    });
  }
});
