import { test, expect } from 'bun:test';
import { createBlackboardLtiPlatform } from '../../../../scripts/blackboard-lti-mock/server.mjs';
import { postScoreToAgs, getToolJwks } from './blackboard-ags.server';

async function getJson(origin: string, path: string) {
  const res = await fetch(new URL(path, origin));
  const json = await res.json();
  return json;
}

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


// Release fires the passback without awaiting it. A rejection there used to be
// unhandled, and with the mock down that killed the whole dev server.
test('a background passback that fails is logged, never left unhandled', async () => {
  const { postGradeToBlackboardInBackground } = await import('./blackboard-ags.server');
  const previous = process.env.BLACKBOARD_LTI_MOCK_URL;
  process.env.BLACKBOARD_LTI_MOCK_URL = 'http://127.0.0.1:1';
  const warn = console.warn;
  const warnings: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    await expect(
      postGradeToBlackboardInBackground({ numericPercentage: 80 })
    ).resolves.toBeUndefined();
    expect(warnings.length).toBe(1);
  } finally {
    console.warn = warn;
    if (previous === undefined) delete process.env.BLACKBOARD_LTI_MOCK_URL;
    else process.env.BLACKBOARD_LTI_MOCK_URL = previous;
  }
});
