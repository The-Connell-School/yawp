import { afterAll, beforeAll, expect, test } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beginGoogle, exchangeGoogle, googleAvailable } from './google.server';
import type { Flow } from './flow.server';

const originalFetch = globalThis.fetch;
const oldId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const oldSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
let privateKey: CryptoKey;
let jwk: any;
let claims: Record<string, unknown>;
let tokenStatus = 200;
let observed: URLSearchParams;
beforeAll(async () => {
  process.env.GOOGLE_OAUTH_CLIENT_ID = 'local-client';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'local', alg: 'RS256' };
  globalThis.fetch = (async (url: any, init?: RequestInit) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      observed = new URLSearchParams(init?.body as URLSearchParams);
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256', kid: 'local' })
        .setIssuer('https://accounts.google.com')
        .setAudience('local-client')
        .setSubject('subject-1')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
      return Response.json({ id_token: token }, { status: tokenStatus });
    }
    if (url === 'https://www.googleapis.com/oauth2/v3/certs')
      return Response.json({ keys: [jwk] });
    throw new Error('Unexpected external request');
  }) as typeof fetch;
});
afterAll(() => {
  globalThis.fetch = originalFetch;
  if (oldId === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  else process.env.GOOGLE_OAUTH_CLIENT_ID = oldId;
  if (oldSecret === undefined) delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  else process.env.GOOGLE_OAUTH_CLIENT_SECRET = oldSecret;
});
function flow(): Flow {
  return {
    id: 'hash',
    token: 'opaque',
    browser: 'browser',
    data: { destination: '/app/my-classes', state: { screen: 'entry' } },
  };
}
test('Google authorization has state, nonce and S256 PKCE; the server retains their secrets', () => {
  const context = flow();
  const result = beginGoogle(
    context,
    new Request('http://127.0.0.1:5396/auth/login')
  );
  const url = new URL(result.redirectTo);
  expect(url.origin).toBe('https://accounts.google.com');
  expect(url.searchParams.get('state')).toHaveLength(43);
  expect(url.searchParams.get('nonce')).toBe(context.data.google!.nonce);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(result.redirectTo).not.toContain(context.data.google!.verifier);
  expect(result.redirectTo).not.toContain('local-secret');
});
test('signed verified Google identity is validated using fixed provider endpoints and verifier', async () => {
  const context = flow();
  beginGoogle(context, new Request('http://localhost/auth/login'));
  claims = {
    nonce: context.data.google!.nonce,
    email: 'User@example.test',
    email_verified: true,
  };
  expect(await exchangeGoogle('local-code', context.data.google!)).toEqual({
    subject: 'subject-1',
    email: 'user@example.test',
  });
  expect(observed.get('code_verifier')).toBe(context.data.google!.verifier);
  expect(observed.get('redirect_uri')).toBe(
    'http://localhost/auth/unified/google/callback'
  );
});
for (const invalid of [
  { email_verified: false },
  { nonce: 'foreign' },
  { email: 'bad-email' },
  { azp: 'foreign-client' },
])
  test(`Google rejects ${JSON.stringify(invalid)}`, async () => {
    const context = flow();
    beginGoogle(context, new Request('http://localhost/auth/login'));
    claims = {
      nonce: context.data.google!.nonce,
      email: 'user@example.test',
      email_verified: true,
      ...invalid,
    };
    await expect(
      exchangeGoogle('local-code', context.data.google!)
    ).rejects.toThrow();
  });
test('provider failure never authenticates', async () => {
  const context = flow();
  beginGoogle(context, new Request('http://localhost/auth/login'));
  tokenStatus = 400;
  await expect(
    exchangeGoogle('bad-code', context.data.google!)
  ).rejects.toThrow();
  tokenStatus = 200;
});
test('missing or partial configuration disables Google', () => {
  delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  expect(googleAvailable()).toBe(false);
  expect(() =>
    beginGoogle(flow(), new Request('http://localhost/auth/login'))
  ).toThrow();
  process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'local-secret';
});
