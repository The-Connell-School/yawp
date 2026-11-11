import { afterAll, afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { FlowError } from './flow.server';

const savedEnv = {
  YAWP_ENVIRONMENT: process.env.YAWP_ENVIRONMENT,
  PRIMARY_APP_URL: process.env.PRIMARY_APP_URL,
};

const unifiedAction = mock(
  async (_request: Request, _values: Record<string, string>) =>
    Response.json({ state: { screen: 'entry' } })
);

mock.module('~/utils/auth.server', () => ({
  requireAnonymous: async () => {},
  requireMutableRequest: async () => {},
}));
mock.module('~/routes/auth.login/login.server', () => ({
  loginAction: async () => new Response('legacy'),
}));
mock.module('./backend.server', () => ({ unifiedAction }));

const { dispatchUnifiedLogin } = await import('./entry.server');

afterAll(() => {
  mock.restore();
});

afterEach(() => {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

beforeEach(() => {
  unifiedAction.mockReset();
});

const actionArgs = (body: URLSearchParams, request?: Request) =>
  ({
    request:
      request ??
      new Request('http://localhost/auth/login', {
        method: 'POST',
        body,
      }),
    params: {},
    context: {},
  }) as Parameters<typeof dispatchUnifiedLogin>[0];

test('dispatchUnifiedLogin redacts sensitive FlowError.message in JSON error field', async () => {
  const sensitive =
    'Invalid `prisma.user.findMany()` token=SECRET-TOKEN teacher@school.edu';
  unifiedAction.mockImplementation(async () => {
    throw new FlowError(sensitive, 400);
  });

  const response = (await dispatchUnifiedLogin(
    actionArgs(
      new URLSearchParams({ intent: 'resolve', identifier: 'test@example.com' })
    )
  )) as unknown as Response;

  expect(response.status).toBe(400);
  const json = await response.json();
  expect(json.error).not.toContain('SECRET-TOKEN');
  expect(json.error).not.toContain('teacher@school.edu');
  expect(json.error.length).toBeGreaterThan(0);
});

test('dispatchUnifiedLogin keeps intentional FlowError validation copy', async () => {
  unifiedAction.mockImplementation(async () => {
    throw new FlowError('Invalid request origin.', 403);
  });

  const response = (await dispatchUnifiedLogin(
    actionArgs(
      new URLSearchParams({ intent: 'resolve', identifier: 'test@example.com' })
    )
  )) as unknown as Response;

  expect(response.status).toBe(403);
  const json = await response.json();
  expect(json.error).toBe('Invalid request origin.');
});

test('dispatchUnifiedLogin accepts the public HTTPS Origin on production HTTP ingress', async () => {
  process.env.YAWP_ENVIRONMENT = 'production';
  process.env.PRIMARY_APP_URL = 'https://yawp.school';
  unifiedAction.mockResolvedValue(Response.json({ state: { screen: 'entry' } }));

  const response = (await dispatchUnifiedLogin(
    actionArgs(
      new URLSearchParams({
        intent: 'resolve',
        identifier: 'test@example.com',
      }),
      new Request('http://abc123.us-east-1.awsapprunner.com/auth/login.data', {
        method: 'POST',
        headers: { Origin: 'https://yawp.school' },
        body: new URLSearchParams({
          intent: 'resolve',
          identifier: 'test@example.com',
        }),
      })
    )
  )) as unknown as Response;

  expect(response.status).toBe(200);
  expect(unifiedAction).toHaveBeenCalledTimes(1);
});

test('dispatchUnifiedLogin rejects a foreign Origin on production HTTP ingress', async () => {
  process.env.YAWP_ENVIRONMENT = 'production';
  process.env.PRIMARY_APP_URL = 'https://yawp.school';

  const response = (await dispatchUnifiedLogin(
    actionArgs(
      new URLSearchParams({
        intent: 'resolve',
        identifier: 'test@example.com',
      }),
      new Request('http://yawp.school/auth/login.data', {
        method: 'POST',
        headers: { Origin: 'https://evil.example' },
        body: new URLSearchParams({
          intent: 'resolve',
          identifier: 'test@example.com',
        }),
      })
    )
  )) as unknown as Response;

  expect(response.status).toBe(403);
  const json = await response.json();
  expect(json.error).toBe('Invalid request origin.');
  expect(unifiedAction).not.toHaveBeenCalled();
});

test('dispatchUnifiedLogin leaves error empty when fieldErrors are present', async () => {
  unifiedAction.mockImplementation(async () => {
    throw new FlowError('ignored top-level', 400, undefined, {
      identifier: 'Enter a valid email.',
    });
  });

  const response = (await dispatchUnifiedLogin(
    actionArgs(
      new URLSearchParams({ intent: 'resolve', identifier: 'bad' })
    )
  )) as unknown as Response;

  const json = await response.json();
  expect(json.error).toBe('');
  expect(json.fieldErrors).toEqual({ identifier: 'Enter a valid email.' });
});
