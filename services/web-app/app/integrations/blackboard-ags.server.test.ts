import { test, expect, mock } from 'bun:test';
import { createBlackboardLtiPlatform } from '../../../../scripts/blackboard-lti-mock/server.mjs';
import { postScoreToAgs, getToolJwks } from './blackboard-ags.server';

async function getJson(origin: string, path: string) {
  const res = await fetch(new URL(path, origin));
  const json = await res.json();
  return json;
}

test('AGS token errors omit upstream response bodies', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock(async () => {
    return new Response('{"access_token":"leaked-secret-token","error":"bad"}', {
      status: 401,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  try {
    let message = 'no error thrown';
    try {
      await postScoreToAgs({
        lineItemUrl: 'https://blackboard.example/scores',
        userId: 'bb-user',
        scoreGiven: 1,
        scoreMaximum: 100,
        tokenEndpoint: 'https://blackboard.example/token',
        clientId: 'client-id',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/AGS token endpoint error HTTP 401/);
    expect(message).not.toContain('leaked-secret-token');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('posts a score to Blackboard mock AGS using client assertion', async () => {
  process.env.BLACKBOARD_LTI_MOCK_ENABLED = 'true';
  process.env.YAWP_ENVIRONMENT = 'preview';

  const jwks = getToolJwks();
  const publicJwk = jwks.keys[0] as any;

  const platform = createBlackboardLtiPlatform({ toolPublicJwk: publicJwk, tokenTtlSeconds: 45 });
  const { origin, close } = await platform.listen(0, '127.0.0.1');
  try {
    const tokenEndpoint = `${origin}/api/v1/gateway/oauth2/jwttoken`;
    const lineItemUrl = `${origin}/learn/api/v1/lti/courses/_4_1/lineItems/_99_1_grade/scores`;
    await postScoreToAgs({
      lineItemUrl,
      userId: 'bb-user-student',
      scoreGiven: 88,
      scoreMaximum: 100,
      tokenEndpoint,
      clientId: 'yawp-blackboard-mock',
    });
    const inspect = await getJson(origin, '/dev/scores');
    expect(Array.isArray(inspect.received)).toBe(true);
    const last = inspect.received[inspect.received.length - 1];
    expect(last.userId).toBe('bb-user-student');
    expect(last.scoreGiven).toBe(88);
    expect(last.lineItemId).toBe('_99_1_grade');
  } finally {
    await close();
  }
});

