import { afterEach, describe, expect, mock, test } from 'bun:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const priorFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = priorFetch;
  mock.restore();
});

function unsignedIdToken(payload: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'test' }), 'utf8').toString(
    'base64url'
  );
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${header}.${body}.`;
}

async function signedIdToken(payload: Record<string, unknown>, jwksUrl: string) {
  const { privateKey, publicKey } = await generateKeyPair('RS256', {
    modulusLength: 2048,
  });
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = 'test-kid';
  publicJwk.use = 'sig';
  publicJwk.alg = 'RS256';
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url) === jwksUrl) {
      return new Response(JSON.stringify({ keys: [publicJwk] }), { status: 200 });
    }
    return priorFetch(url as RequestInfo);
  }) as typeof fetch;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .sign(privateKey);
}

describe('verifyLtiLaunchIdToken', () => {
  test('rejects forged tokens on production with no session side effects path', async () => {
    const { verifyLtiLaunchIdToken } = await import('./verify-id-token.server.ts');
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      sub: 'attacker',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiResourceLinkRequest',
    };
    const result = await verifyLtiLaunchIdToken({
      idToken: unsignedIdToken(payload),
      state: '',
      request: new Request('https://yawp.school/lti/launch', { method: 'POST' }),
      env: { YAWP_ENVIRONMENT: 'production' } as unknown as NodeJS.ProcessEnv,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  test('rejects unsigned tokens when mock URL is not configured', async () => {
    const { verifyLtiLaunchIdToken } = await import('./verify-id-token.server.ts');
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiDeepLinkingRequest',
    };
    const result = await verifyLtiLaunchIdToken({
      idToken: unsignedIdToken(payload),
      state: 's1',
      request: new Request('https://app.test/lti/launch', {
        method: 'POST',
        headers: { cookie: 'yawp_lti_state=s1' },
      }),
      env: { YAWP_ENVIRONMENT: 'preview' } as unknown as NodeJS.ProcessEnv,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.response.status).toBe(401);
  });

  test('accepts a JWKS-verified token from the mock platform', async () => {
    const { verifyLtiLaunchIdToken } = await import('./verify-id-token.server.ts');
    const jwksUrl =
      'http://127.0.0.1:9473/api/v1/management/applications/yawp-blackboard-mock/jwks.json';
    const now = Math.floor(Date.now() / 1000);
    const token = await signedIdToken(
      {
        iss: 'https://blackboard.com',
        aud: 'yawp-blackboard-mock',
        sub: 'bb-user',
        iat: now,
        exp: now + 300,
        nonce: 'n1',
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiResourceLinkRequest',
      },
      jwksUrl
    );
    const result = await verifyLtiLaunchIdToken({
      idToken: token,
      state: 's1',
      request: new Request('https://app.test/lti/launch', {
        method: 'POST',
        headers: {
          cookie:
            'yawp_lti_state=s1; yawp_lti_nonce=n1; yawp_lti_client=yawp-blackboard-mock',
        },
      }),
      env: {
        YAWP_ENVIRONMENT: 'preview',
        BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
        LTI_CLIENT_ID: 'yawp-blackboard-mock',
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.payload.sub).toBe('bb-user');
  });

  test('allows unsigned mock fallback only when mock verification is enabled', async () => {
    const { verifyLtiLaunchIdToken } = await import('./verify-id-token.server.ts');
    const payload = {
      iss: 'https://blackboard.com',
      aud: 'yawp-blackboard-mock',
      nonce: 'n1',
      'https://purl.imsglobal.org/spec/lti/claim/message_type':
        'LtiDeepLinkingRequest',
    };
    const result = await verifyLtiLaunchIdToken({
      idToken: unsignedIdToken(payload),
      state: 's1',
      request: new Request('https://app.test/lti/launch', {
        method: 'POST',
        headers: {
          cookie:
            'yawp_lti_state=s1; yawp_lti_nonce=n1; yawp_lti_client=yawp-blackboard-mock',
        },
      }),
      env: {
        YAWP_ENVIRONMENT: 'preview',
        BLACKBOARD_LTI_MOCK_URL: 'http://127.0.0.1:9473',
      } as unknown as NodeJS.ProcessEnv,
    });
    expect(result.ok).toBe(true);
  });
});
