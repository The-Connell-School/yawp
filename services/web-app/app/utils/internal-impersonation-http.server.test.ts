import { expect, test } from 'bun:test';
import { createImpersonationHttp } from './internal-impersonation-http.server';
import { getImpersonationAttribution } from './internal-impersonation-context.server';
const identity = { id: '612c6fdd-5190-4132-8894-84b461152143', actorId: 'operator', userId: 'teacher', organizationId: 'org', membershipId: 'member', expiresAt: new Date(Date.now() + 60000).toISOString() };
const cookies = (response: Response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
function fixture(options: { endFails?: boolean; auditFails?: boolean } = {}) {
  let starts = 0, resolves = 0, ends = 0, active = true;
  const audits: string[] = [];
  const http = createImpersonationHttp({ origin: 'https://yawp.test', secrets: ['test-secret'], secure: true, enabled: () => true,
    service: {
      start: async () => { starts++; return { identity, cookieToken: 'c'.repeat(43) }; },
      resolve: async () => { resolves++; if (!active) throw new Error('revoked'); return identity; },
      end: async () => { ends++; if (options.endFails) throw new Error("unavailable"); },
    }, audit: async (_identity, _operation, action) => { audits.push(action); if (options.auditFails) throw new Error("audit unavailable"); },
  });
  return { http, audits, counts: () => ({ starts, resolves, ends }), revoke: () => { active = false; } };
}
async function login(http: ReturnType<typeof createImpersonationHttp>) {
  const page = await http.page();
  const html = await page.text();
  const csrf = JSON.parse(html.match(/const csrf = ("[^"]+")/)![1]!);
  return http.start(new Request('https://yawp.test/auth/internal-impersonation', {
    method: 'POST', headers: { origin: 'https://yawp.test', cookie: cookies(page), 'content-type': 'application/json' },
    body: JSON.stringify({ token: 'a'.repeat(43), csrf }),
  }));
}
test('handoff strips fragment and consumes only after same-origin CSRF validation', async () => {
  const f = fixture();
  const page = await f.http.page();
  expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect((await page.text())).toContain('history.replaceState');
  const rejected = await f.http.start(new Request('https://yawp.test/auth/internal-impersonation', { method: 'POST', headers: { origin: 'https://evil.test' }, body: '{}' }));
  expect(rejected.status).toBe(403);
  expect(f.counts().starts).toBe(0);
  const signedIn = await login(f.http);
  expect(signedIn.status).toBe(200);
  expect(signedIn.headers.get('cache-control')).toBe('no-store');
  expect(signedIn.headers.getSetCookie().some(cookie => cookie.startsWith('yawp_internal_impersonation=') && cookie.includes('HttpOnly') && cookie.includes('Secure'))).toBe(true);
  expect(signedIn.headers.getSetCookie().some(cookie => cookie.startsWith('en_session=') && cookie.includes('Max-Age=0'))).toBe(true);
  expect(f.counts().starts).toBe(1);
});
test('middleware validates each request, pins attribution, audits completion and denies revoked access', async () => {
  const f = fixture();
  const signedIn = await login(f.http);
  const request = new Request('https://yawp.test/app', { headers: { cookie: cookies(signedIn) } });
  let nextCalls = 0;
  const next = async () => { nextCalls++; expect(getImpersonationAttribution()).toEqual(identity); return new Response('app'); };
  expect((await f.http.middleware({ request } as any, next)).status).toBe(200);
  expect((await f.http.middleware({ request } as any, next)).status).toBe(200);
  expect(f.counts().resolves).toBe(2);
  expect(f.audits).toEqual(['request.started', 'request.completed.200', 'request.started', 'request.completed.200']);
  expect(getImpersonationAttribution()).toBe(null);
  f.revoke();
  expect((await f.http.middleware({ request } as any, next)).status).toBe(401);
  expect(nextCalls).toBe(2);
});
test('invalid cookies never fall back and unsafe requests or alternate authentication are blocked', async () => {
  const f = fixture();
  const signedIn = await login(f.http);
  let calls = 0;
  const next = async () => { calls++; return new Response('ordinary'); };
  expect((await f.http.middleware({ request: new Request('https://yawp.test/app') } as any, next)).status).toBe(200);
  expect((await f.http.middleware({ request: new Request('https://yawp.test/app', { headers: { cookie: 'yawp_internal_impersonation=invalid' } }) } as any, next)).status).toBe(401);
  for (const path of ['/auth/dev-login', '/api/impersonate', '/api/membership-id']) {
    const request = new Request(`https://yawp.test${path}`, { method: 'POST', headers: { cookie: cookies(signedIn), origin: 'https://yawp.test' } });
    expect((await f.http.middleware({ request } as any, next)).status).toBe(403);
  }
  const crossOrigin = new Request('https://yawp.test/api/model/test', { method: 'POST', headers: { cookie: cookies(signedIn), origin: 'https://evil.test' } });
  expect((await f.http.middleware({ request: crossOrigin } as any, next)).status).toBe(403);
  expect(calls).toBe(1);
});
test('exit closes the session and clears both login cookies after revocation', async () => {
  const f = fixture();
  const signedIn = await login(f.http);
  f.revoke();
  const ended = await f.http.end(new Request('https://yawp.test/auth/internal-impersonation/end', { method: 'POST', headers: { cookie: cookies(signedIn), origin: 'https://yawp.test' } }));
  expect(ended.status).toBe(303);
  expect(f.counts().ends).toBe(1);
  expect(ended.headers.getSetCookie().filter(value => value.includes('Max-Age=0')).length).toBeGreaterThanOrEqual(2);
});

test('failed termination clears browser credentials and reports that termination is unconfirmed', async () => {
  const f = fixture({ endFails: true });
  const signedIn = await login(f.http);
  const ended = await f.http.end(new Request('https://yawp.test/auth/internal-impersonation/end', {
    method: 'POST', headers: { cookie: cookies(signedIn), origin: 'https://yawp.test' },
  }));
  expect(ended.status).toBe(503);
  expect(f.counts().ends).toBe(1);
  expect(ended.headers.getSetCookie().filter(value => value.includes('Max-Age=0'))).toHaveLength(4);
});
test('an unavailable audit sink prevents application execution', async () => {
  const f = fixture({ auditFails: true });
  const signedIn = await login(f.http);
  let calls = 0;
  await expect(f.http.middleware({ request: new Request('https://yawp.test/app', {
    headers: { cookie: cookies(signedIn) },
  }) } as any, async () => { calls++; return new Response('app'); })).rejects.toThrow('audit unavailable');
  expect(calls).toBe(0);
  expect(getImpersonationAttribution()).toBe(null);
});
test('downstream ordinary login cookies are suppressed and responses are never cached', async () => {
  const f = fixture();
  const signedIn = await login(f.http);
  const response = await f.http.middleware({ request: new Request('https://yawp.test/app', {
    headers: { cookie: cookies(signedIn) },
  }) } as any, async () => {
    const headers = new Headers({ 'cache-control': 'public, max-age=600' });
    headers.append('set-cookie', 'en_session=another-user');
    headers.append('set-cookie', 'membership-id=another-org');
    headers.append('set-cookie', 'theme=dark');
    return new Response('app', { headers });
  });
  expect(response.headers.getSetCookie()).toEqual(['theme=dark']);
  expect(response.headers.get('cache-control')).toBe('no-store');
});

test('replacement closes the previous session before redeeming another link', async () => {
  const f = fixture({ endFails: true });
  const signedIn = await login(f.http);
  const page = await f.http.page();
  const csrf = JSON.parse((await page.text()).match(/const csrf = ("[^"]+")/)![1]!);
  const response = await f.http.start(new Request('https://yawp.test/auth/internal-impersonation', {
    method: 'POST', headers: {
      origin: 'https://yawp.test', cookie: `${cookies(signedIn).split("; ").find(value => value.startsWith("yawp_internal_impersonation="))}; ${cookies(page)}`,
      'content-type': 'application/json',
    }, body: JSON.stringify({ token: 'b'.repeat(43), csrf }),
  }));
  expect(response.status).toBe(403);
  expect(f.counts().starts).toBe(1);
});

test('impersonation error reporting excludes cookies, tokens, queries and exception details', async () => {
  const { reportImpersonationError } = await import('./internal-impersonation-error.server');
  const records: unknown[] = [];
  const report = (entry: unknown) => { records.push(entry); };
  expect(reportImpersonationError(new Request('https://yawp.test/app?token=secret', { headers: { cookie: 'yawp_internal_impersonation=secret', authorization: 'Bearer secret' } }), report)).toBe(true);
  expect(reportImpersonationError(new Request('https://yawp.test/auth/internal-impersonation?token=secret'), report)).toBe(true);
  expect(reportImpersonationError(new Request('https://yawp.test/app', { headers: { cookie: 'ordinary=session' } }), report)).toBe(false);
  expect(reportImpersonationError(new Request('https://yawp.test/api/internal/v1/qa/accounts', { headers: { authorization: 'Bearer secret' } }), report)).toBe(true);
  expect(records).toEqual([{ event: 'internal_impersonation_request_failed' }, { event: 'internal_impersonation_request_failed' }, { event: 'internal_impersonation_request_failed' }]);
  expect(JSON.stringify(records)).not.toContain('secret');
});
