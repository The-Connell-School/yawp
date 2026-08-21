import { generateKeyPairSync } from 'node:crypto';
import { createBlackboardLtiPlatform } from '../../../../scripts/blackboard-lti-mock/server.mjs';
import { postScoreToAgs, maybePostGradeToBlackboard } from './blackboard-ags.server';

async function getJson(origin: string, path: string) {
  const res = await fetch(new URL(path, origin));
  const json = await res.json();
  return json;
}

test('posts a score to Blackboard mock AGS using client assertion', async () => {
  process.env.BLACKBOARD_LTI_MOCK_ENABLED = 'true';
  process.env.YAWP_ENVIRONMENT = 'preview';

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  // Node KeyObject export to JWK is supported for RSA keys
  const publicJwk = publicKey.export({ format: 'jwk' }) as any;
  // Minimal kid is fine — the mock uses the provided publicJwk directly
  publicJwk.kid = publicJwk.kid || 'tool-key';

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
      privateKeyPem: privateKey.export({ format: 'pem', type: 'pkcs1' }).toString(),
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

test('maybePostGradeToBlackboard posts to mock using launch-derived claims', async () => {
  process.env.BLACKBOARD_LTI_MOCK_ENABLED = 'true';
  process.env.YAWP_ENVIRONMENT = 'preview';

  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicJwk = publicKey.export({ format: 'jwk' }) as any;
  publicJwk.kid = publicJwk.kid || 'tool-key-2';

  const platform = createBlackboardLtiPlatform({ toolPublicJwk: publicJwk, tokenTtlSeconds: 45 });
  const { origin, close } = await platform.listen(0, '127.0.0.1');
  try {
    // Configure the app-side helper
    process.env.BLACKBOARD_LTI_MOCK_URL = origin;
    process.env.LTI_CLIENT_ID = 'yawp-blackboard-mock';
    process.env.LTI_TOOL_PRIVATE_KEY_PEM = privateKey.export({ format: 'pem', type: 'pkcs1' }).toString();

    await maybePostGradeToBlackboard({ numericPercentage: 77 });

    const inspect = await getJson(origin, '/dev/scores');
    const last = inspect.received[inspect.received.length - 1];
    expect(last.userId).toBe('bb-user-student');
    expect(last.scoreGiven).toBe(77);
    expect(last.lineItemId).toBe('_99_1_grade');
  } finally {
    await close();
  }
});

