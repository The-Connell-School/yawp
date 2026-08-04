import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  PREVIEW_ACCESS_COOKIE_NAME,
  clearPreviewAccessCookie,
  createPreviewAccessMiddleware,
  findPreviewAccessSeatByCode,
  getPreviewAccessSeat,
  grantPreviewAccessCookie,
  isPreviewAccessConfigured,
  previewAccessMiddleware,
  validatePreviewAccessCode,
} from './preview-access.server';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PREVIEW_ACCESS_CODES: process.env.PREVIEW_ACCESS_CODES,
  PREVIEW_ACCESS_GATE: process.env.PREVIEW_ACCESS_GATE,
  PREVIEW_DATA_MODE: process.env.PREVIEW_DATA_MODE,
  PREVIEW_ACCESS_SEATS: process.env.PREVIEW_ACCESS_SEATS,
  PREVIEW_ACCESS_SECRET: process.env.PREVIEW_ACCESS_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
};

function restore(name: keyof typeof originalEnv) {
  const value = originalEnv[name];
  if (value === undefined) Reflect.deleteProperty(process.env, name);
  else process.env[name] = value as never;
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://preview.yawp.school${path}`, init);
}

function middlewareArgs(value: Request) {
  return {
    request: value,
    params: {},
    context: {} as never,
    url: new URL(value.url),
    pattern: '*',
  } as Parameters<typeof previewAccessMiddleware>[0];
}

describe('preview access gate', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.PREVIEW_ACCESS_GATE = 'on';
    process.env.PREVIEW_DATA_MODE = 'seed';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Brian Connell',
      },
      {
        code: 'calm-panda-8127',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.SESSION_SECRET = 'different-app-session-secret';
  });

  afterEach(() => {
    restore('NODE_ENV');
    restore('PREVIEW_ACCESS_CODES');
    restore('PREVIEW_ACCESS_GATE');
    restore('PREVIEW_DATA_MODE');
    restore('PREVIEW_ACCESS_SEATS');
    restore('PREVIEW_ACCESS_SECRET');
    restore('SESSION_SECRET');
  });

  test('blocks an unauthenticated loader before it runs', async () => {
    const next = mock(async () => new Response('private loader data'));

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/app/classes')),
      next,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('location')).toBe(
      '/auth/preview-access?returnTo=%2Fapp%2Fclasses',
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks unauthenticated actions, above all POST /auth/dev-login', async () => {
    const next = mock(async () =>
      new Response('passwordless admin session', { status: 302 }),
    );

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/auth/dev-login', { method: 'POST' })),
      next,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks unauthenticated API routes before they run', async () => {
    const next = mock(async () => Response.json({ private: true }));

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/api/model/assignments')),
      next,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(await (response as Response).json()).toEqual({
      error: 'Preview access code required.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('keeps only the healthcheck and access-code route open', async () => {
    const next = mock(async () => new Response('ok'));

    for (const path of [
      '/api/healthcheck',
      '/auth/preview-access',
      '/auth/preview-access.data',
    ]) {
      const response = await previewAccessMiddleware(
        middlewareArgs(request(path)),
        next,
      );
      expect(await response?.text()).toBe('ok');
    }

    expect(next).toHaveBeenCalledTimes(3);
  });

  test('fails closed when no access codes are configured', async () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    delete process.env.PREVIEW_ACCESS_CODES;
    const next = mock(async () => new Response('private'));

    expect(validatePreviewAccessCode('brave-otter-4193')).toBe(false);
    const response = await previewAccessMiddleware(
      middlewareArgs(request('/app')),
      next,
    );

    expect((response as Response).status).toBe(302);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a valid signed cookie and rejects a tampered cookie', async () => {
    const seat = findPreviewAccessSeatByCode('brave-otter-4193');
    expect(seat).toEqual({
      organizationId: 'local-dev-org',
      label: 'Brian Connell',
    });
    const serialized = await grantPreviewAccessCookie(seat!);
    const next = mock(async () => new Response('private'));
    const middleware = createPreviewAccessMiddleware(async () => null);

    expect(serialized).toContain(`${PREVIEW_ACCESS_COOKIE_NAME}=`);
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Max-Age=2592000');
    expect(serialized).toContain('SameSite=Lax');
    expect(serialized).toContain('Secure');
    const cookiePair = serialized.split(';', 1)[0];

    const authenticated = await middleware(
      middlewareArgs(request('/app', { headers: { cookie: cookiePair } })),
      next,
    );
    expect(await authenticated?.text()).toBe('private');

    const tampered = `${cookiePair.slice(0, -1)}x`;
    const rejected = await middleware(
      middlewareArgs(request('/app', { headers: { cookie: tampered } })),
      next,
    );
    expect((rejected as Response).status).toBe(302);
    expect(next).toHaveBeenCalledTimes(1);

    const parsedSeat = await getPreviewAccessSeat(
      request('/app', { headers: { cookie: cookiePair } }),
    );
    expect(parsedSeat).toEqual(seat);
  });

  test('rejects an authenticated session that is bound outside the signed seat', async () => {
    const seat = findPreviewAccessSeatByCode('calm-panda-8127')!;
    const cookie = (await grantPreviewAccessCookie(seat)).split(';', 1)[0];
    const next = mock(async () => new Response('private'));
    const sessionGuard = mock(async () =>
      Response.json({ error: 'Session belongs to another seat.' }, { status: 401 }),
    );
    const middleware = createPreviewAccessMiddleware(sessionGuard);
    const value = request('/api/model/assignments', {
      headers: { cookie },
    });

    const response = await middleware(middlewareArgs(value), next);

    expect((response as Response).status).toBe(401);
    expect(sessionGuard).toHaveBeenCalledWith(value, seat);
    expect(next).not.toHaveBeenCalled();
  });

  test('keeps production-dump previews gated without imposing seeded seat IDs', async () => {
    process.env.PREVIEW_DATA_MODE = 'production-dump';
    const seat = findPreviewAccessSeatByCode('brave-otter-4193')!;
    const cookie = (await grantPreviewAccessCookie(seat)).split(';', 1)[0];
    const sessionGuard = mock(async () =>
      Response.json({ error: 'seed-only guard ran' }, { status: 500 }),
    );
    const next = mock(async () => new Response('production data'));
    const middleware = createPreviewAccessMiddleware(sessionGuard);

    const response = await middleware(
      middlewareArgs(request('/app', { headers: { cookie } })),
      next,
    );

    expect(await response?.text()).toBe('production data');
    expect(sessionGuard).not.toHaveBeenCalled();
  });

  test('clears the signed access cookie for re-entry', async () => {
    const serialized = await clearPreviewAccessCookie();

    expect(serialized).toContain(`${PREVIEW_ACCESS_COOKIE_NAME}=`);
    expect(serialized).toContain('Max-Age=0');
    expect(serialized).toContain('HttpOnly');
  });

  test('does not gate local development unless explicitly enabled', async () => {
    delete process.env.PREVIEW_ACCESS_GATE;
    const next = mock(async () => new Response('local'));

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/app')),
      next,
    );

    expect(await response?.text()).toBe('local');
  });
});

describe('preview access codes', () => {
  afterEach(() => {
    restore('PREVIEW_ACCESS_CODES');
    restore('PREVIEW_ACCESS_SEATS');
    restore('PREVIEW_ACCESS_SECRET');
    restore('SESSION_SECRET');
  });

  test('validates configured codes case-insensitively and rejects malformed codes', () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_ACCESS_CODES =
      'brave-otter-4193,calm-panda-8127,not a code';

    expect(validatePreviewAccessCode(' Brave-Otter-4193 ')).toBe(true);
    expect(validatePreviewAccessCode('calm-panda-8127')).toBe(true);
    expect(validatePreviewAccessCode('not a code')).toBe(false);
    expect(validatePreviewAccessCode('brave-otter-4194')).toBe(false);
  });

  test('maps each timing-safe code match to exactly one seat', () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Brian Connell',
      },
      {
        code: 'calm-panda-8127',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);

    expect(findPreviewAccessSeatByCode(' CALM-PANDA-8127 ')).toEqual({
      organizationId: 'preview-seat-2',
      label: 'Bryant Brock',
    });
    expect(findPreviewAccessSeatByCode('wrong-panda-8127')).toBeNull();
  });

  test('fails closed for malformed or duplicate seat maps', () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Brian Connell',
      },
      {
        code: 'brave-otter-4193',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);

    expect(isPreviewAccessConfigured()).toBe(false);
    expect(findPreviewAccessSeatByCode('brave-otter-4193')).toBeNull();
  });

  test('requires a dedicated gate secret and does not fall back to SESSION_SECRET', () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    process.env.PREVIEW_ACCESS_CODES = 'brave-otter-4193';
    process.env.SESSION_SECRET = 'app-session-secret-is-not-a-gate-secret';
    delete process.env.PREVIEW_ACCESS_SECRET;

    expect(isPreviewAccessConfigured()).toBe(false);
    expect(validatePreviewAccessCode('brave-otter-4193')).toBe(false);
  });

  test('gate cookies survive app-session rotation but not gate-secret rotation', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'preview-access-secret-one';
    process.env.SESSION_SECRET = 'app-session-secret-one';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Brian Connell',
      },
    ]);
    const seat = findPreviewAccessSeatByCode('brave-otter-4193')!;
    const serialized = await grantPreviewAccessCookie(seat);
    const cookie = serialized.split(';', 1)[0];

    process.env.SESSION_SECRET = 'app-session-secret-two';
    expect(
      await getPreviewAccessSeat(request('/app', { headers: { cookie } })),
    ).toEqual(seat);

    process.env.PREVIEW_ACCESS_SECRET = 'preview-access-secret-two';
    expect(
      await getPreviewAccessSeat(request('/app', { headers: { cookie } })),
    ).toBeNull();
  });
});
