import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import {
  PREVIEW_ACCESS_COOKIE_NAME,
  FREE_TIER_ACCESS_COOKIE_NAME,
  FREE_TIER_ACCESS_MAX_AGE,
  createFreeTierAccessCookie,
  type FreeTierPreviewDependencies,
  PREVIEW_MASTER_SELECTION_COOKIE_NAME,
  PREVIEW_AUTHORIZED_ACTIVITY_HEADER,
  clearPreviewMasterSelectionCookie,
  clearPreviewAccessCookie,
  createPreviewAccessCookie,
  createPreviewAccessMiddleware,
  findPreviewAccessCredentialByCode,
  findPreviewAccessSeatByCode,
  getConfiguredPreviewOrganizationAccessCode,
  getPreviewAccessSeat,
  hasPreviewMasterSelection,
  grantPreviewAccessCookie,
  grantPreviewMasterSelectionCookie,
  isIsolatedPreviewSeatMode,
  isPreviewAccessConfigured,
  previewAccessMiddleware,
  type PreviewAccessSeatRepository,
  validatePreviewAccessCode,
} from './preview-access.server';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PREVIEW_ACCESS_CODES: process.env.PREVIEW_ACCESS_CODES,
  PREVIEW_ACCESS_GATE: process.env.PREVIEW_ACCESS_GATE,
  PREVIEW_MASTER_ACCESS_CODE: process.env.PREVIEW_MASTER_ACCESS_CODE,
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

function repository({
  byCode = {},
  byId = {},
}: {
  byCode?: Record<string, { id: string; name: string } | null>;
  byId?: Record<
    string,
    { id: string; name: string; previewSeatCode: string | null } | null
  >;
} = {}): PreviewAccessSeatRepository {
  return {
    findByCode: mock(async (code: string) => byCode[code] ?? null),
    findById: mock(async (id: string) => byId[id] ?? null),
  };
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
        label: 'Master',
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
    restore('PREVIEW_MASTER_ACCESS_CODE');
    restore('PREVIEW_DATA_MODE');
    restore('PREVIEW_ACCESS_SEATS');
    restore('PREVIEW_ACCESS_SECRET');
    restore('SESSION_SECRET');
  });

  describe('scoped free-tier access', () => {
    function dependencies(session: 'anonymous' | 'teacher' | 'denied' = 'anonymous'): FreeTierPreviewDependencies {
      return {
        acquisition: mock(async (token) => token === 'valid-event' ? { tokenId: 'event-1' } : null),
        signed: mock(async (token, purpose) => token === `valid-${purpose}` ? { tokenId: 'link-1', applicationId: 'application-1' } : null),
        session: mock(async () => session),
      };
    }
    async function enter(path = '/free?t=valid-event', deps = dependencies()) {
      const guard = mock(async () => null);
      const next = mock(async () => new Response('flow', { headers: { 'Set-Cookie': 'route-cookie=kept' } }));
      const middleware = createPreviewAccessMiddleware(guard, repository(), deps);
      const response = (await middleware(middlewareArgs(request(path)), next))!;
      return { response, middleware, deps, guard, next, cookie: response.headers.getSetCookie().find(c => c.startsWith(FREE_TIER_ACCESS_COOKIE_NAME + '='))?.split(';', 1)[0] };
    }

    test('valid acquisition token grants a separate signed cookie without a seat or activity', async () => {
      const { response, cookie, guard, deps } = await enter();
      expect(response.status).toBe(200);
      expect(cookie).toBeDefined();
      expect(response.headers.getSetCookie()).toContain('route-cookie=kept');
      const serialized = response.headers.getSetCookie().find(c => c.startsWith(FREE_TIER_ACCESS_COOKIE_NAME + '='))!;
      for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', `Max-Age=${FREE_TIER_ACCESS_MAX_AGE}`]) expect(serialized).toContain(flag);
      expect(response.headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)).toBeNull();
      expect(response.headers.get('set-cookie')).not.toContain(PREVIEW_ACCESS_COOKIE_NAME + '=');
      expect(await getPreviewAccessSeat(request('/free', { headers: { cookie: cookie! } }), repository())).toBeNull();
      expect(guard).not.toHaveBeenCalled();
      expect(deps.acquisition).toHaveBeenCalledWith('valid-event');
    });

    test('signed join and both admin links validate the route purpose without consuming', async () => {
      for (const [path, purpose] of [['/free/join', 'RELEASE'], ['/free/admin/approve', 'ADMIN_APPROVE'], ['/free/admin/not-right-person', 'ADMIN_NOT_RIGHT_PERSON']] as const) {
        const { response, deps } = await enter(`${path}.data?t=valid-${purpose}`);
        expect(response.status).toBe(200);
        expect(deps.signed).toHaveBeenCalledWith(`valid-${purpose}`, purpose);
        expect(deps.acquisition).not.toHaveBeenCalled();
      }
    });

    test('invalid, expired, disabled, exhausted, garbage and missing tokens retain normal rejection', async () => {
      for (const token of ['invalid', 'expired', 'disabled', 'exhausted', 'garbage', '']) {
        const { response, next } = await enter('/free?t=' + token);
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/auth/preview-access?' + new URLSearchParams({ returnTo: '/free?t=' + token }));
        expect(response.headers.get('set-cookie')).toBeNull();
        expect(next).not.toHaveBeenCalled();
      }
      for (const path of ['/free/join?t=invalid', '/free/admin/approve?t=valid-RELEASE', '/app/admin?t=valid-event', '/free/unknown?t=valid-event']) expect((await enter(path)).response.status).toBe(302);
    });

    test('cookie covers exact flow paths, data, actions, APIs and manifest reads', async () => {
      const { middleware, cookie, guard } = await enter();
      for (const path of ['/free', '/free/', '/free.data', '/free?_data=routes/free._index', '/free/join', '/free/admin/approve', '/free/admin/not-right-person', '/join', '/auth/login', '/auth/logout', '/app/free-tier/onboarding?step=administrator', '/app/free-tier/onboarding.data', '/app/free-tier/pending', '/app/free-tier/preview', '/app/free-tier/status', '/app/free-tier/setup', '/api/free-tier/token', '/api/free-tier/waitlist']) {
        for (const method of ['GET', 'POST']) {
          const response = await middleware(middlewareArgs(request(path, { method, headers: { cookie: cookie! } })), async () => new Response('flow'));
          expect(response?.status).toBe(200);
          expect(response?.headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)).toBeNull();
        }
      }
      expect((await middleware(middlewareArgs(request('/__manifest?paths=%2Fapp%2Fadmin', { headers: { cookie: cookie! } })), async () => new Response('manifest')))?.status).toBe(200);
      expect(guard).not.toHaveBeenCalled();
    });

    test('grant cannot unlock privileged paths, unknown descendants, or arbitrary app routes', async () => {
      const { middleware, cookie } = await enter('/free?t=valid-event', dependencies('teacher'));
      for (const path of ['/auth/dev-login', '/auth/dev-login/options', '/auth/dev-login.data', '/auth/preview-access/choose', '/app/admin', '/app/tester/feedback', '/api/internal/private', '/api/impersonate', '/app/classes', '/app/free-tier/unknown', '/free/join/unknown', '/app/my-classes/other']) {
        const next = mock(async () => new Response('private'));
        const response = await middleware(middlewareArgs(request(path, { headers: { cookie: cookie! } })), next);
        expect(response?.status).toBe(path.startsWith('/api/') ? 401 : 302);
        expect(next).not.toHaveBeenCalled();
      }
    });

    test('only the matching teacher session may use minimal first-login landing routes', async () => {
      for (const session of ['anonymous', 'teacher', 'denied'] as const) {
        const { middleware, cookie } = await enter('/free?t=valid-event');
        const scoped = createPreviewAccessMiddleware(async () => null, repository(), dependencies(session));
        for (const path of ['/app', '/app.data', '/app/my-classes', '/app/my-classes.data']) {
          const response = await scoped(middlewareArgs(request(path, { headers: { cookie: cookie! } })), async () => new Response('own classes'));
          expect(response?.status).toBe(session === 'teacher' ? 200 : 302);
        }
        if (session === 'denied') {
          for (const [path, method] of [['/free', 'GET'], ['/app/free-tier/onboarding', 'POST'], ['/api/free-tier/token', 'GET']] as const) {
            const response = await scoped(middlewareArgs(request(path, { method, headers: { cookie: cookie! } })), async () => new Response('private'));
            expect(response?.status).toBe(method === 'POST' || path.startsWith('/api/') ? 401 : 302);
          }
          expect((await enter('/free?t=valid-event', dependencies('denied'))).response.status).toBe(302);
        }
        expect(middleware).toBeDefined();
      }
    });

    test('a free-tier grant cannot help an impersonation context', async () => {
      const { middleware, cookie } = await enter();
      const next = mock(async () => new Response('private'));
      const response = await middleware(middlewareArgs(request('/free', { headers: { cookie: cookie + '; yawp_internal_impersonation=present' } })), next);
      expect(response?.status).toBe(302);
      expect(next).not.toHaveBeenCalled();
    });

    test('forged, expired, future, malformed and tampered cookies fail closed', async () => {
      const { middleware, cookie } = await enter();
      const base = { kind: 'acquisition', tokenId: 'event-1', issuedAt: Math.floor(Date.now() / 1000) };
      for (const invalid of ['forged', { ...base, issuedAt: base.issuedAt - FREE_TIER_ACCESS_MAX_AGE - 1 }, { ...base, issuedAt: base.issuedAt + 3600 }, { ...base, kind: 'master' }, { ...base, tokenId: '' }]) {
        const signed = (await createFreeTierAccessCookie().serialize(invalid)).split(';', 1)[0];
        const response = await middleware(middlewareArgs(request('/free', { headers: { cookie: signed } })), async () => new Response('private'));
        expect(response?.status).toBe(302);
      }
      for (const bad of [FREE_TIER_ACCESS_COOKIE_NAME + '=forged', cookie!.slice(0, -5) + 'wrong']) {
        expect((await middleware(middlewareArgs(request('/free', { headers: { cookie: bad } })), async () => new Response('private')))?.status).toBe(302);
      }
    });

    test('gate off performs no validation and adds no cookie with tokens or a forged grant', async () => {
      delete process.env.PREVIEW_ACCESS_GATE;
      const deps = dependencies();
      const middleware = createPreviewAccessMiddleware(async () => null, repository(), deps);
      for (const path of ['/free', '/free?t=valid-event', '/free/join?t=valid-RELEASE', '/app/admin']) {
        const next = mock(async () => new Response('production'));
        const response = await middleware(middlewareArgs(request(path, { headers: { cookie: FREE_TIER_ACCESS_COOKIE_NAME + '=forged' } })), next);
        expect(await response?.text()).toBe('production');
        expect(response?.headers.get('set-cookie')).toBeNull();
        expect(next).toHaveBeenCalledTimes(1);
      }
      expect(deps.acquisition).not.toHaveBeenCalled();
      expect(deps.signed).not.toHaveBeenCalled();
      expect(deps.session).not.toHaveBeenCalled();
    });
  });

  test('blocks an unauthenticated loader before it runs', async () => {
    const next = mock(async () => new Response('private loader data'));

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/app/classes')),
      next
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(302);
    expect((response as Response).headers.get('location')).toBe(
      '/auth/preview-access?returnTo=%2Fapp%2Fclasses'
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks unauthenticated actions, above all POST /auth/dev-login', async () => {
    const next = mock(
      async () => new Response('passwordless admin session', { status: 302 })
    );

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/auth/dev-login', { method: 'POST' })),
      next
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('blocks unauthenticated API routes before they run', async () => {
    const next = mock(async () => Response.json({ private: true }));

    const response = await previewAccessMiddleware(
      middlewareArgs(request('/api/model/assignments')),
      next
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(401);
    expect(await (response as Response).json()).toEqual({
      error: 'Preview access code required.',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('keeps service-authenticated and access-code routes open', async () => {
    const next = mock(async () => new Response('ok'));

    for (const path of [
      '/api/healthcheck',
      '/api/stripe/webhook',
      '/api/preview/qa/signon-code',
      '/auth/preview-access',
      '/auth/preview-access.data',
    ]) {
      const response = await previewAccessMiddleware(
        middlewareArgs(request(path)),
        next
      );
      expect(await response?.text()).toBe('ok');
      expect(
        response?.headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)
      ).toBeNull();
    }

    expect(next).toHaveBeenCalledTimes(5);
  });

  test('public legal reads need no seat and never authorize preview activity', async () => {
    const next = mock(async () => new Response('legal'));
    for (const path of [
      '/privacy',
      '/privacy/',
      '/privacy.data',
      '/terms',
      '/terms/',
      '/terms.data',
    ]) {
      for (const method of ['GET', 'HEAD']) {
        const response = await previewAccessMiddleware(
          middlewareArgs(request(path, { method })),
          next
        );
        expect(response?.status).toBe(200);
        expect(
          response?.headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)
        ).toBeNull();
      }
    }
    expect(next).toHaveBeenCalledTimes(12);
    for (const [path, method] of [
      ['/privacy', 'POST'],
      ['/terms', 'POST'],
      ['/privacy/private', 'GET'],
      ['/free', 'GET'],
      ['/app', 'GET'],
    ]) {
      const response = await previewAccessMiddleware(
        middlewareArgs(request(path!, { method })),
        next
      );
      expect(response?.status).not.toBe(200);
    }
    expect(next).toHaveBeenCalledTimes(12);
  });

  test('lets Yawp Internal reach the rubric catalog without a preview cookie', async () => {
    const next = mock(async () => new Response('ok'));

    for (const path of [
      '/api/internal/v1/rubric-catalog',
      '/api/internal/v1/rubric-catalog/item',
      '/api/internal/v1/rubric-catalog/stage',
      '/api/internal/v1/rubric-catalog/versions',
      '/api/internal/v1/rubric-catalog/unrelease',
    ]) {
      const response = await previewAccessMiddleware(
        middlewareArgs(request(path)),
        next
      );
      expect(await response?.text()).toBe('ok');
    }
    expect(next).toHaveBeenCalledTimes(5);

    const gated = await previewAccessMiddleware(
      middlewareArgs(request('/api/internal/v1/users')),
      next
    );
    expect((gated as Response).status).toBe(401);
    expect(next).toHaveBeenCalledTimes(5);
  });

  test('lets Yawp Internal reach feature flags and the school list without a preview cookie', async () => {
    const next = mock(async () => new Response('ok'));
    const open = [
      ['GET', '/api/internal/v1/feature-flags'],
      ['POST', '/api/internal/v1/feature-flags/lesson_planner'],
      ['GET', '/api/internal/v1/organizations'],
    ] as const;

    for (const [method, path] of open) {
      const response = await previewAccessMiddleware(
        middlewareArgs(request(path, { method })),
        next
      );
      expect(await response?.text()).toBe('ok');
    }
    expect(next).toHaveBeenCalledTimes(open.length);

    for (const [method, path] of [
      ['GET', '/api/internal/v1/users'],
      ['GET', '/api/internal/v1/feature-flags/'],
      ['POST', '/api/internal/v1/feature-flags/a/b'],
      ['POST', '/api/internal/v1/feature-flags/lesson_planner/'],
      ['POST', '/api/internal/v1/feature-flags/..%2Fusers'],
      ['GET', '/api/internal/v1/feature-flags-x'],
      ['GET', '/api/internal/v1/organizations/other'],
      ['POST', '/api/internal/v1/organizations/search'],
      ['GET', '/api/internal/v1/admin/users'],
      ['GET', '/api/internal/v1/admin/organizations-other'],
      ['GET', '/api/internal/v1/admin/teacher-trainings-other'],
      ['GET', '/api/internal/v1/users'],
    ] as const) {
      const gated = await previewAccessMiddleware(
        middlewareArgs(request(path, { method })),
        next
      );
      expect((gated as Response).status).toBe(401);
    }
    expect(next).toHaveBeenCalledTimes(open.length);
  });

  test('lets Yawp Internal reach operator routes without a preview cookie', async () => {
    const next = mock(async () => new Response('ok'));
    for (const [method, path] of [
      ['GET', '/api/internal/v1/free-tier/tokens'],
      ['POST', '/api/internal/v1/free-tier/release'],
      ['GET', '/api/internal/v1/free-tier/applications?q=x'],
      ['GET', '/api/internal/v1/admin/teacher-trainings'],
      ['POST', '/api/internal/v1/admin/teacher-trainings'],
      ['PATCH', '/api/internal/v1/admin/teacher-trainings/tt-1'],
      ['DELETE', '/api/internal/v1/admin/teacher-trainings/tt-1'],
      ['PUT', '/api/internal/v1/admin/teacher-trainings/tt-1/image'],
      ['POST', '/api/internal/v1/admin/teacher-trainings/tt-1/modules'],
      ['PUT', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/order'],
      ['POST', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/m-1/video/upload-url'],
      ['POST', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/m-1/video/complete'],
      ['DELETE', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/m-1/video'],
      ['POST', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/m-1/resources/upload-url'],
      ['POST', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/m-1/resources/complete'],
      ['DELETE', '/api/internal/v1/admin/teacher-trainings/tt-1/modules/m-1/resources/r-1'],
      ['GET', '/api/internal/v1/admin/organizations'],
      ['GET', '/api/internal/v1/admin/organizations/org-1'],
      ['GET', '/api/internal/v1/admin/organizations/org-1/invitations'],
      ['POST', '/api/internal/v1/admin/organizations/org-1/invitations'],
      ['POST', '/api/internal/v1/admin/organizations/org-1/invitations/inv-1/resend'],
      ['POST', '/api/internal/v1/admin/organizations/org-1/invitations/inv-1/revoke'],
      ['GET', '/api/internal/v1/admin/organizations/org-1/invitations/inv-1/revoke'],
      ['GET', '/api/internal/v1/admin/grading-benchmark/cases'],
      ['POST', '/api/internal/v1/admin/grading-benchmark/cases/c-1/run'],
      ['GET', '/api/internal/v1/admin/assignment-types/at-1/prompt-versions'],
      ['POST', '/api/internal/v1/admin/assignment-types/at-1/scratch-check'],
      ['GET', '/api/internal/v1/admin/assignment-types/at-1/evaluation-suites'],
      ['GET', '/api/internal/v1/admin/assignment-types/at-1/evaluation-runs'],
      ['POST', '/api/internal/v1/admin/assignment-types/at-1/evaluation-runs'],
      [
        'DELETE',
        '/api/internal/v1/admin/assignment-types/at-1/evaluation-suites/suite-1',
      ],
      [
        'DELETE',
        '/api/internal/v1/admin/assignment-types/at-1/prompt-versions/2',
      ],
      ['GET', '/api/internal/v1/admin/assignment-types'],
      ['POST', '/api/internal/v1/admin/assignment-types'],
      ['GET', '/api/internal/v1/admin/assignment-types/at-1'],
      ['PATCH', '/api/internal/v1/admin/assignment-types/at-1'],
      ['POST', '/api/internal/v1/admin/assignment-types/at-1/archive'],
      ['POST', '/api/internal/v1/admin/assignment-types/at-1/restore'],
      ['PUT', '/api/internal/v1/admin/assignment-types/at-1/image'],
      ['DELETE', '/api/internal/v1/admin/assignment-types/at-1/image'],
      ['POST', '/api/internal/v1/admin/assignment-types/at-1/modules'],
      ['GET', '/api/internal/v1/admin/assignment-types/at-1/modules/m-1'],
      ['PUT', '/api/internal/v1/admin/assignment-types/at-1/modules/order'],
      [
        'POST',
        '/api/internal/v1/admin/assignment-types/at-1/modules/m-1/steps',
      ],
      [
        'PATCH',
        '/api/internal/v1/admin/assignment-types/at-1/modules/m-1/steps/s-1',
      ],
      [
        'PUT',
        '/api/internal/v1/admin/assignment-types/at-1/modules/m-1/steps/order',
      ],
    ] as const) {
      const response = await previewAccessMiddleware(
        middlewareArgs(request(path, { method })),
        next
      );
      expect(await response?.text()).toBe('ok');
    }
    expect(next).toHaveBeenCalledTimes(46);
  });

  test('fails closed when no access codes are configured', async () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    delete process.env.PREVIEW_ACCESS_CODES;
    const next = mock(async () => new Response('private'));

    expect(await validatePreviewAccessCode('brave-otter-4193')).toBe(false);
    const response = await previewAccessMiddleware(
      middlewareArgs(request('/app')),
      next
    );

    expect((response as Response).status).toBe(302);
    expect(next).not.toHaveBeenCalled();
  });

  test('accepts a valid signed cookie and rejects a tampered cookie', async () => {
    const seat = await findPreviewAccessSeatByCode('brave-otter-4193');
    expect(seat).toEqual({
      organizationId: 'local-dev-org',
      label: 'Master',
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
      next
    );
    expect(await authenticated?.text()).toBe('private');
    expect(authenticated?.headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)).toBe(
      '1'
    );

    const valueStart = cookiePair.indexOf('=') + 1;
    const replacement = cookiePair[valueStart] === 'a' ? 'b' : 'a';
    const tampered = `${cookiePair.slice(0, valueStart)}${replacement}${cookiePair.slice(valueStart + 1)}`;
    const rejected = await middleware(
      middlewareArgs(request('/app', { headers: { cookie: tampered } })),
      next
    );
    expect((rejected as Response).status).toBe(302);
    expect(
      (rejected as Response).headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)
    ).toBeNull();
    expect(next).toHaveBeenCalledTimes(1);

    const parsedSeat = await getPreviewAccessSeat(
      request('/app', { headers: { cookie: cookiePair } })
    );
    expect(parsedSeat).toEqual(seat);
  });

  test('rejects signed access cookies after their embedded preview-access lifetime', async () => {
    const expiredAt = Math.floor(Date.now() / 1000) - 31 * 24 * 60 * 60;
    const expiredValue = `seat-v2:${expiredAt}:local-dev-org`;
    const serialized =
      await createPreviewAccessCookie().serialize(expiredValue);
    const cookie = serialized.split(';', 1)[0];

    expect(
      await getPreviewAccessSeat(request('/app', { headers: { cookie } }))
    ).toBeNull();
  });

  test('rejects legacy signed access cookies that have no embedded lifetime', async () => {
    const serialized = await createPreviewAccessCookie().serialize(
      'seat-v1:local-dev-org'
    );
    const cookie = serialized.split(';', 1)[0];

    expect(
      await getPreviewAccessSeat(request('/app', { headers: { cookie } }))
    ).toBeNull();
  });

  test('does not mark a stale runtime-seat cookie as authorized activity', async () => {
    const cookie = (
      await grantPreviewAccessCookie({
        organizationId: 'preview-seat-2',
        label: 'Removed seat',
      })
    ).split(';', 1)[0];
    const next = mock(async () => new Response('private'));
    const middleware = createPreviewAccessMiddleware(
      async () => null,
      repository({ byId: { 'preview-seat-2': null } })
    );

    const response = (await middleware(
      middlewareArgs(request('/app', { headers: { cookie } })),
      next
    )) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get(PREVIEW_AUTHORIZED_ACTIVITY_HEADER)).toBeNull();
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects an authenticated session that is bound outside the signed seat', async () => {
    const runtimeRepository = repository({
      byCode: {
        'calm-panda-8127': {
          id: 'preview-seat-2',
          name: 'Yawp Preview - Seat 2',
        },
      },
      byId: {
        'preview-seat-2': {
          id: 'preview-seat-2',
          name: 'Yawp Preview - Seat 2',
          previewSeatCode: 'calm-panda-8127',
        },
      },
    });
    const seat = (await findPreviewAccessSeatByCode(
      'calm-panda-8127',
      runtimeRepository
    ))!;
    const cookie = (await grantPreviewAccessCookie(seat)).split(';', 1)[0];
    const next = mock(async () => new Response('private'));
    const sessionGuard = mock(async () =>
      Response.json(
        { error: 'Session belongs to another seat.' },
        { status: 401 }
      )
    );
    const middleware = createPreviewAccessMiddleware(
      sessionGuard,
      runtimeRepository
    );
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
    const seat = (await findPreviewAccessSeatByCode('brave-otter-4193'))!;
    const cookie = (await grantPreviewAccessCookie(seat)).split(';', 1)[0];
    const sessionGuard = mock(async () =>
      Response.json({ error: 'seed-only guard ran' }, { status: 500 })
    );
    const next = mock(async () => new Response('production data'));
    const middleware = createPreviewAccessMiddleware(sessionGuard);

    const response = await middleware(
      middlewareArgs(request('/app', { headers: { cookie } })),
      next
    );

    expect(await response?.text()).toBe('production data');
    expect(sessionGuard).not.toHaveBeenCalled();
  });

  test('binds sanitized production access to its configured production organization', async () => {
    process.env.PREVIEW_DATA_MODE = 'sanitized-production';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'default-org',
        label: 'Production rehearsal',
      },
    ]);
    const seat = await findPreviewAccessSeatByCode('brave-otter-4193');
    expect(seat).toEqual({
      organizationId: 'default-org',
      label: 'Production rehearsal',
    });

    const cookie = (await grantPreviewAccessCookie(seat!)).split(';', 1)[0];
    expect(
      await getPreviewAccessSeat(
        request('/app', { headers: { cookie } }),
        repository()
      )
    ).toEqual(seat);
    expect(isIsolatedPreviewSeatMode()).toBe(false);
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
      next
    );

    expect(await response?.text()).toBe('local');
  });

  describe('one-click ?code= entry', () => {
    test('a generic master code in a URL is stripped without granting access', async () => {
      process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
      const next = mock(async () => new Response('private'));
      const middleware = createPreviewAccessMiddleware(
        async () => null,
        repository()
      );

      const response = (await middleware(
        middlewareArgs(request('/app/classes?code=yawp-rocks&tab=roster')),
        next
      )) as Response;

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/app/classes?tab=roster');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    test('a valid code sets the cookie, 303s, and strips the param', async () => {
      const next = mock(async () => new Response('private'));

      const response = (await previewAccessMiddleware(
        middlewareArgs(
          request('/app/classes?code=brave-otter-4193&tab=roster')
        ),
        next
      )) as Response;

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/app/classes?tab=roster');
      expect(response.headers.get('set-cookie')).toContain(
        `${PREVIEW_ACCESS_COOKIE_NAME}=`
      );
      expect(next).not.toHaveBeenCalled();

      const seat = await getPreviewAccessSeat(
        request('/app', {
          headers: {
            cookie: response.headers.get('set-cookie')!.split(';', 1)[0],
          },
        })
      );
      expect(seat).toEqual({
        organizationId: 'local-dev-org',
        label: 'Master',
      });
    });

    test('an unknown code falls through to the normal access screen', async () => {
      const next = mock(async () => new Response('private'));

      const response = (await previewAccessMiddleware(
        middlewareArgs(request('/app/classes?code=not-a-real-code-9999')),
        next
      )) as Response;

      expect(response.status).toBe(303);
      expect(response.headers.get('location')).toBe('/app/classes');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    test('is inert while the gate is disabled', async () => {
      delete process.env.PREVIEW_ACCESS_GATE;
      const next = mock(async () => new Response('local'));

      const response = await previewAccessMiddleware(
        middlewareArgs(request('/app?code=brave-otter-4193')),
        next
      );

      expect(await response?.text()).toBe('local');
      expect(response?.headers.get('set-cookie')).toBeNull();
    });

    test('does not run for POST requests', async () => {
      const next = mock(async () => new Response('ok'));

      const response = (await previewAccessMiddleware(
        middlewareArgs(
          request('/app/classes?code=brave-otter-4193', { method: 'POST' })
        ),
        next
      )) as Response;

      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    test('an existing seat cookie takes precedence while the code is stripped', async () => {
      const cookie = (
        await grantPreviewAccessCookie({
          organizationId: 'local-dev-org',
          label: 'Master',
        })
      ).split(';', 1)[0];
      const next = mock(async () => new Response('private'));
      const middleware = createPreviewAccessMiddleware(async () => null);

      const response = await middleware(
        middlewareArgs(
          request('/app?code=calm-panda-8127&tab=classes', {
            headers: { cookie },
          })
        ),
        next
      );

      expect(response?.status).toBe(303);
      expect(response?.headers.get('location')).toBe('/app?tab=classes');
      expect(response?.headers.get('set-cookie')).toBeNull();
      expect(next).not.toHaveBeenCalled();
    });

    test('leaves the Google OAuth callback code for the route', async () => {
      const cookie = (
        await grantPreviewAccessCookie({
          organizationId: 'local-dev-org',
          label: 'Master',
        })
      ).split(';', 1)[0];
      const next = mock(async () => new Response('callback'));
      const middleware = createPreviewAccessMiddleware(async () => null);

      const response = await middleware(
        middlewareArgs(
          request('/auth/unified/google/callback?state=abc&code=4%2F0Axyz', {
            headers: { cookie },
          })
        ),
        next
      );

      expect(next).toHaveBeenCalledTimes(1);
      expect(response?.status).toBe(200);
    });
  });
});

describe('preview access codes', () => {
  afterEach(() => {
    restore('PREVIEW_ACCESS_CODES');
    restore('PREVIEW_ACCESS_SEATS');
    restore('PREVIEW_ACCESS_SECRET');
    restore('PREVIEW_MASTER_ACCESS_CODE');
    restore('SESSION_SECRET');
  });

  test('resolves the master code case-insensitively and rejects malformed codes', async () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_ACCESS_CODES =
      'brave-otter-4193,calm-panda-8127,not a code';

    const runtimeRepository = repository();
    expect(
      await validatePreviewAccessCode(' Brave-Otter-4193 ', runtimeRepository)
    ).toBe(true);
    expect(
      await validatePreviewAccessCode('not a code', runtimeRepository)
    ).toBe(false);
    expect(
      await validatePreviewAccessCode('brave-otter-4194', runtimeRepository)
    ).toBe(false);
  });

  test('resolves the configured organization code without a DB query', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
      {
        code: 'calm-panda-8127',
        organizationId: 'preview-seat-2',
        label: 'Bryant Brock',
      },
    ]);

    const runtimeRepository = repository();
    expect(
      await findPreviewAccessSeatByCode(' BRAVE-OTTER-4193 ', runtimeRepository)
    ).toEqual({
      organizationId: 'local-dev-org',
      label: 'Master',
    });
    expect(runtimeRepository.findByCode).not.toHaveBeenCalled();
  });

  test('preserves the organization meaning when a database code collides with master', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    ]);
    const runtimeRepository = repository({
      byCode: {
        'yawp-rocks': { id: 'existing-org', name: 'Existing Org' },
      },
    });

    expect(
      await findPreviewAccessCredentialByCode('yawp-rocks', runtimeRepository)
    ).toEqual({
      kind: 'organization',
      seat: { organizationId: 'existing-org', label: 'Existing Org' },
    });
  });

  test('distinguishes a generic master credential from an organization code', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    ]);
    const runtimeRepository = repository();

    expect(
      await findPreviewAccessCredentialByCode(' YAWP-ROCKS ', runtimeRepository)
    ).toEqual({ kind: 'master' });
    expect(
      await findPreviewAccessCredentialByCode(
        'brave-otter-4193',
        runtimeRepository
      )
    ).toEqual({
      kind: 'organization',
      seat: {
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    });
    expect(
      await findPreviewAccessSeatByCode('yawp-rocks', runtimeRepository)
    ).toBeNull();
    expect(runtimeRepository.findByCode).toHaveBeenCalledWith('yawp-rocks');
  });

  test('keeps the configured organization code distinct from the generic master', () => {
    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    ]);

    expect(getConfiguredPreviewOrganizationAccessCode('local-dev-org')).toBe(
      'brave-otter-4193'
    );
    expect(
      getConfiguredPreviewOrganizationAccessCode('preview-seat-2')
    ).toBeNull();
  });

  test('uses a short-lived signed master-selection cookie without granting preview access', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    ]);

    const serialized = await grantPreviewMasterSelectionCookie();
    const cookie = serialized.split(';', 1)[0];
    const pendingRequest = request('/auth/preview-access', {
      headers: { cookie },
    });

    expect(serialized).toContain(`${PREVIEW_MASTER_SELECTION_COOKIE_NAME}=`);
    expect(serialized).toContain('HttpOnly');
    expect(serialized).toContain('Max-Age=600');
    expect(serialized).toContain('Path=/');
    expect(await hasPreviewMasterSelection(pendingRequest)).toBe(true);
    expect(await getPreviewAccessSeat(pendingRequest)).toBeNull();
    expect(await clearPreviewMasterSelectionCookie()).toContain('Max-Age=0');
  });

  test('accepts a master-selected organization without requiring an organization code', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    ]);
    const selectedSeat = {
      organizationId: 'another-org',
      label: 'Another Organization',
      accessKind: 'master' as const,
    };
    const cookie = (await grantPreviewAccessCookie(selectedSeat)).split(
      ';',
      1
    )[0];

    expect(
      await getPreviewAccessSeat(
        request('/app', { headers: { cookie } }),
        repository({
          byId: {
            'another-org': {
              id: 'another-org',
              name: 'Another Organization',
              previewSeatCode: null,
            },
          },
        })
      )
    ).toEqual(selectedSeat);
  });

  test('revokes pending and selected master access when the master code rotates', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rocks';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Yawp Local Dev',
      },
    ]);
    const pendingCookie = (await grantPreviewMasterSelectionCookie()).split(
      ';',
      1
    )[0];
    const accessCookie = (
      await grantPreviewAccessCookie({
        organizationId: 'another-org',
        label: 'Another Organization',
        accessKind: 'master',
      })
    ).split(';', 1)[0];

    process.env.PREVIEW_MASTER_ACCESS_CODE = 'yawp-rules';

    expect(
      await hasPreviewMasterSelection(
        request('/auth/preview-access', {
          headers: { cookie: pendingCookie },
        })
      )
    ).toBe(false);
    expect(
      await getPreviewAccessSeat(
        request('/app', { headers: { cookie: accessCookie } }),
        repository({
          byId: {
            'another-org': {
              id: 'another-org',
              name: 'Another Organization',
              previewSeatCode: null,
            },
          },
        })
      )
    ).toBeNull();
  });

  test('resolves runtime seats by their unique DB code and rejects unknown codes', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'test-preview-access-secret';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
    ]);
    const runtimeRepository = repository({
      byCode: {
        'calm-panda-8127': {
          id: 'preview-seat-2',
          name: 'Yawp Preview - Seat 2',
        },
      },
    });

    expect(
      await findPreviewAccessSeatByCode(' CALM-PANDA-8127 ', runtimeRepository)
    ).toEqual({
      organizationId: 'preview-seat-2',
      label: 'Yawp Preview - Seat 2',
    });
    expect(
      await findPreviewAccessSeatByCode('wrong-panda-8127', runtimeRepository)
    ).toBeNull();
    expect(runtimeRepository.findByCode).toHaveBeenCalledWith(
      'calm-panda-8127'
    );
  });

  test('requires a dedicated gate secret and does not fall back to SESSION_SECRET', async () => {
    delete process.env.PREVIEW_ACCESS_SEATS;
    process.env.PREVIEW_ACCESS_CODES = 'brave-otter-4193';
    process.env.SESSION_SECRET = 'app-session-secret-is-not-a-gate-secret';
    delete process.env.PREVIEW_ACCESS_SECRET;

    expect(isPreviewAccessConfigured()).toBe(false);
    expect(await validatePreviewAccessCode('brave-otter-4193')).toBe(false);
  });

  test('accepts runtime-seat cookies only while the organization remains a seat', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'preview-access-secret-one';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
    ]);
    const runtimeSeat = {
      organizationId: 'preview-seat-2',
      label: 'Yawp Preview - Seat 2',
    };
    const cookie = (await grantPreviewAccessCookie(runtimeSeat)).split(
      ';',
      1
    )[0];

    expect(
      await getPreviewAccessSeat(
        request('/app', { headers: { cookie } }),
        repository({
          byId: {
            'preview-seat-2': {
              id: 'preview-seat-2',
              name: 'Yawp Preview - Seat 2',
              previewSeatCode: 'calm-panda-8127',
            },
          },
        })
      )
    ).toEqual(runtimeSeat);
    expect(
      await getPreviewAccessSeat(
        request('/app', { headers: { cookie } }),
        repository({
          byId: {
            'preview-seat-2': {
              id: 'preview-seat-2',
              name: 'Yawp Preview - Seat 2',
              previewSeatCode: null,
            },
          },
        })
      )
    ).toBeNull();
  });

  test('gate cookies survive app-session rotation but not gate-secret rotation', async () => {
    process.env.PREVIEW_ACCESS_SECRET = 'preview-access-secret-one';
    process.env.SESSION_SECRET = 'app-session-secret-one';
    process.env.PREVIEW_ACCESS_SEATS = JSON.stringify([
      {
        code: 'brave-otter-4193',
        organizationId: 'local-dev-org',
        label: 'Master',
      },
    ]);
    const seat = (await findPreviewAccessSeatByCode('brave-otter-4193'))!;
    const serialized = await grantPreviewAccessCookie(seat);
    const cookie = serialized.split(';', 1)[0];

    process.env.SESSION_SECRET = 'app-session-secret-two';
    expect(
      await getPreviewAccessSeat(request('/app', { headers: { cookie } }))
    ).toEqual(seat);

    process.env.PREVIEW_ACCESS_SECRET = 'preview-access-secret-two';
    expect(
      await getPreviewAccessSeat(request('/app', { headers: { cookie } }))
    ).toBeNull();
  });
});
