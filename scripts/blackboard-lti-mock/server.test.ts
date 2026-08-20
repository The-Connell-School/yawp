import { afterEach, describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { createBlackboardLtiPlatform } from './server.mjs';
import { signJwt, verifyJwt } from './jwt.mjs';
import { jwkThumbprint } from './keys.mjs';

const servers = [];

async function listen(platform) {
  const { origin, close } = await platform.listen(0, '127.0.0.1');
  servers.push(close);
  return origin;
}

async function request(origin, path, init = {}) {
  const headers = { ...(init.headers || {}) };
  let body = init.body;
  if (body && typeof body === 'object' && !(body instanceof URLSearchParams) && !(body instanceof Buffer)) {
    body = new URLSearchParams(body);
  }
  if (body instanceof URLSearchParams && !headers['content-type']) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
  }
  const response = await fetch(`${origin}${path}`, { ...init, headers, body });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, text, json };
}

function generateToolKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = publicKey.export({ format: 'jwk' });
  const kid = jwkThumbprint(jwk);
  return {
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    publicJwk: { ...jwk, kid, use: 'sig', alg: 'RS256' },
    kid,
  };
}

function makePlatform(overrides = {}) {
  return createBlackboardLtiPlatform({
    env: {
      NODE_ENV: 'test',
      BLACKBOARD_LTI_MOCK_ENABLED: 'true',
      ...(overrides.env || {}),
    },
    now: overrides.now,
    tokenTtlSeconds: overrides.tokenTtlSeconds ?? 60,
    timeoutDelayMs: overrides.timeoutDelayMs ?? 20,
    toolPublicJwk: overrides.toolPublicJwk,
    toolJwksUrl: overrides.toolJwksUrl,
    toolRedirectUri:
      overrides.toolRedirectUri ?? 'http://127.0.0.1:9/lti/launch',
    toolOidcLoginUrl:
      overrides.toolOidcLoginUrl ?? 'http://127.0.0.1:9/lti/login',
    publicBasePath: overrides.publicBasePath ?? '',
    issuer: overrides.issuer ?? 'https://blackboard.com',
    clientId: overrides.clientId ?? 'yawp-blackboard-mock',
    deploymentId: overrides.deploymentId ?? 'yawp-mock-deployment',
  });
}

async function completeOidcLaunch(origin, extra = {}) {
  const params = new URLSearchParams({
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: extra.clientId ?? 'yawp-blackboard-mock',
    redirect_uri: extra.redirectUri ?? 'http://127.0.0.1:9/lti/launch',
    login_hint: extra.loginHint ?? 'bb-user-student',
    state: extra.state ?? 'state-1',
    nonce: extra.nonce ?? `nonce-${Math.random().toString(16).slice(2)}`,
    lti_message_hint: extra.ltiMessageHint ?? '',
    format: 'json',
    ...(extra.role ? { role: extra.role } : {}),
    ...(extra.contextId ? { context_id: extra.contextId } : {}),
    ...(extra.contextLabel ? { context_label: extra.contextLabel } : {}),
    ...(extra.contextTitle ? { context_title: extra.contextTitle } : {}),
    ...(extra.resourceLinkId ? { resource_link_id: extra.resourceLinkId } : {}),
    ...(extra.resourceLinkTitle
      ? { resource_link_title: extra.resourceLinkTitle }
      : {}),
    ...(extra.sub ? { sub: extra.sub } : {}),
    ...(extra.fault ? { fault: extra.fault } : {}),
    ...(extra.kid ? { kid: extra.kid } : {}),
  });
  return request(origin, `/api/v1/gateway/oidcauth?${params}`, {
    method: extra.method ?? 'GET',
    headers: extra.headers,
  });
}

async function verifyAgainstJwks(origin, token) {
  const jwks = (await request(origin, '/api/v1/management/applications/yawp-blackboard-mock/jwks.json'))
    .json;
  const { header } = decodeUnchecked(token);
  const jwk = jwks.keys.find((key) => key.kid === header.kid);
  expect(jwk).toBeTruthy();
  return verifyJwt(token, jwk);
}

function decodeUnchecked(token) {
  const [header, payload] = token.split('.');
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()),
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()),
  };
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((close) => close()));
});

describe('Blackboard LTI 1.3 platform mock', () => {
  test('refuses to construct in production', () => {
    expect(() =>
      createBlackboardLtiPlatform({
        env: {
          NODE_ENV: 'production',
          YAWP_ENVIRONMENT: 'production',
          BLACKBOARD_LTI_MOCK_ENABLED: 'true',
        },
      })
    ).toThrow(/production/);
  });

  test('publishes two JWKS keys with RFC 7638 kids and never leaks private material', async () => {
    const origin = await listen(makePlatform());
    const { json, text } = await request(
      origin,
      '/api/v1/management/applications/yawp-blackboard-mock/jwks.json'
    );

    expect(json.keys).toHaveLength(2);
    for (const key of json.keys) {
      expect(key.kty).toBe('RSA');
      expect(key.alg).toBe('RS256');
      expect(key.use).toBe('sig');
      expect(key.kid).toBe(jwkThumbprint(key));
      expect(key.n).toBeTruthy();
      expect(key.e).toBeTruthy();
      expect(key.d).toBeUndefined();
      expect(key.p).toBeUndefined();
      expect(key.q).toBeUndefined();
    }
    expect(text).not.toMatch(/BEGIN (RSA )?PRIVATE KEY/);
    expect(json.keys[0].kid).not.toBe(json.keys[1].kid);
  });

  test('signs an id_token that verifies against the published JWKS', async () => {
    const origin = await listen(makePlatform());
    const launch = await completeOidcLaunch(origin);
    expect(launch.status).toBe(200);
    const verified = await verifyAgainstJwks(origin, launch.json.id_token);
    expect(verified.payload.iss).toBe('https://blackboard.com');
    expect(verified.payload.aud).toBe('yawp-blackboard-mock');
    expect(verified.payload.nonce).toBeTruthy();
    expect(verified.header.alg).toBe('RS256');
  });

  test('id_token carries Blackboard-shaped LTI, AGS, and NRPS claims', async () => {
    const origin = await listen(makePlatform());
    const launch = await completeOidcLaunch(origin, {
      role: 'Learner',
      contextId: '_4_1',
      contextLabel: 'ENG-101',
      contextTitle: 'English Composition',
      resourceLinkId: '_99_1',
      resourceLinkTitle: 'Yawp Assignment',
      sub: 'bb-user-student',
    });
    const { payload } = await verifyAgainstJwks(origin, launch.json.id_token);

    expect(payload.sub).toBe('bb-user-student');
    expect(payload['https://purl.imsglobal.org/spec/lti/claim/message_type']).toBe(
      'LtiResourceLinkRequest'
    );
    expect(payload['https://purl.imsglobal.org/spec/lti/claim/version']).toBe(
      '1.3.0'
    );
    expect(
      payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
    ).toBe('yawp-mock-deployment');
    expect(payload['https://purl.imsglobal.org/spec/lti/claim/roles']).toEqual(
      expect.arrayContaining([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      ])
    );
    expect(payload['https://purl.imsglobal.org/spec/lti/claim/context']).toEqual(
      expect.objectContaining({
        id: '_4_1',
        label: 'ENG-101',
        title: 'English Composition',
      })
    );
    expect(
      payload['https://purl.imsglobal.org/spec/lti/claim/resource_link']
    ).toEqual(
      expect.objectContaining({
        id: '_99_1',
        title: 'Yawp Assignment',
      })
    );
    expect(
      payload['https://purl.imsglobal.org/spec/lti/claim/tool_platform']
    ).toEqual(
      expect.objectContaining({
        product_family_code: 'BlackboardLearn',
        guid: expect.any(String),
      })
    );

    const ags =
      payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'];
    expect(ags.scope).toEqual(
      expect.arrayContaining([
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
        'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
        'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
      ])
    );
    expect(ags.lineitems).toContain('/learn/api/v1/lti/courses/_4_1/lineItems');
    expect(ags.lineitem).toContain('/learn/api/v1/lti/courses/_4_1/lineItems/');

    const nrps =
      payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'];
    expect(nrps.context_memberships_url).toContain(
      '/learn/api/v1/lti/external/namesandroles/_4_1'
    );
    expect(nrps.service_versions).toEqual(['2.0']);
  });

  test('can launch as instructor or administrator with configurable context', async () => {
    const origin = await listen(makePlatform());
    const instructor = await completeOidcLaunch(origin, {
      role: 'Instructor',
      sub: 'bb-user-instructor',
    });
    const admin = await completeOidcLaunch(origin, {
      role: 'Administrator',
      sub: 'bb-user-admin',
    });
    const instructorPayload = (await verifyAgainstJwks(origin, instructor.json.id_token))
      .payload;
    const adminPayload = (await verifyAgainstJwks(origin, admin.json.id_token))
      .payload;
    expect(instructorPayload['https://purl.imsglobal.org/spec/lti/claim/roles']).toEqual(
      expect.arrayContaining([
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      ])
    );
    expect(adminPayload['https://purl.imsglobal.org/spec/lti/claim/roles']).toEqual(
      expect.arrayContaining([
        'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Administrator',
      ])
    );
  });

  test('OIDC login initiation from the panel redirects to the Tool with Blackboard parameters', async () => {
    const origin = await listen(makePlatform());
    const response = await fetch(
      `${origin}/dev/launch?role=Learner&format=redirect`,
      { redirect: 'manual' }
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get('location'));
    expect(location.origin + location.pathname).toBe(
      'http://127.0.0.1:9/lti/login'
    );
    expect(location.searchParams.get('iss')).toBe('https://blackboard.com');
    expect(location.searchParams.get('client_id')).toBe('yawp-blackboard-mock');
    expect(location.searchParams.get('login_hint')).toBeTruthy();
    expect(location.searchParams.get('lti_message_hint')).toBeTruthy();
    expect(location.searchParams.get('target_link_uri')).toBe(
      'http://127.0.0.1:9/lti/launch'
    );
    expect(location.searchParams.get('lti_deployment_id')).toBe(
      'yawp-mock-deployment'
    );
  });
});

describe('fault injection', () => {
  test('expired_launch issues an id_token whose exp is in the past', async () => {
    const origin = await listen(makePlatform({ now: () => 1_700_000_000_000 }));
    const launch = await completeOidcLaunch(origin, { fault: 'expired_launch' });
    const { payload } = decodeUnchecked(launch.json.id_token);
    expect(payload.exp).toBeLessThan(1_700_000_000);
    await expect(
      verifyAgainstJwks(origin, launch.json.id_token)
    ).rejects.toThrow(/exp/i);
  });

  test('replayed_nonce reuses a nonce the mock already issued', async () => {
    const origin = await listen(makePlatform());
    const first = await completeOidcLaunch(origin, { nonce: 'once-only' });
    const replay = await completeOidcLaunch(origin, {
      nonce: 'different',
      fault: 'replayed_nonce',
    });
    const firstPayload = decodeUnchecked(first.json.id_token).payload;
    const replayPayload = decodeUnchecked(replay.json.id_token).payload;
    expect(replayPayload.nonce).toBe(firstPayload.nonce);
  });

  test('invalid_jwt tampers the signature so JWKS verification fails', async () => {
    const origin = await listen(makePlatform());
    const launch = await completeOidcLaunch(origin, { fault: 'invalid_jwt' });
    await expect(
      verifyAgainstJwks(origin, launch.json.id_token)
    ).rejects.toThrow();
  });

  test('mis_signed_jwt is signed with a key that is not in JWKS', async () => {
    const origin = await listen(makePlatform());
    const launch = await completeOidcLaunch(origin, { fault: 'mis_signed_jwt' });
    const jwks = (
      await request(
        origin,
        '/api/v1/management/applications/yawp-blackboard-mock/jwks.json'
      )
    ).json;
    const { header } = decodeUnchecked(launch.json.id_token);
    expect(jwks.keys.some((key) => key.kid === header.kid)).toBe(false);
    await expect(
      verifyAgainstJwks(origin, launch.json.id_token)
    ).rejects.toThrow();
  });

  test('unknown_deployment uses a deployment_id the tool should reject', async () => {
    const origin = await listen(makePlatform());
    const launch = await completeOidcLaunch(origin, {
      fault: 'unknown_deployment',
    });
    const { payload } = await verifyAgainstJwks(origin, launch.json.id_token);
    expect(
      payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
    ).not.toBe('yawp-mock-deployment');
  });

  test('wrong_audience sets aud to a client_id the tool does not own', async () => {
    const origin = await listen(makePlatform());
    const launch = await completeOidcLaunch(origin, { fault: 'wrong_audience' });
    const { payload } = decodeUnchecked(launch.json.id_token);
    expect(payload.aud).not.toBe('yawp-blackboard-mock');
  });

  test('token_endpoint_failure returns a 5xx from the token endpoint', async () => {
    const origin = await listen(makePlatform());
    const response = await request(origin, '/api/v1/gateway/oauth2/jwttoken', {
      method: 'POST',
      headers: { 'x-yawp-lti-fault': 'token_endpoint_failure' },
      body: { grant_type: 'client_credentials' },
    });
    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  test('ags_403_missing_scope returns 403 even with a valid score token', async () => {
    const tool = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const token = await mintToken(origin, tool, [
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    ]);
    const response = await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems/line-1/scores?fault=ags_403_missing_scope',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/vnd.ims.lis.v1.score+json',
        },
        body: JSON.stringify({
          userId: 'bb-user-student',
          timestamp: '2026-08-20T00:00:00.000Z',
          scoreGiven: 90,
          scoreMaximum: 100,
          activityProgress: 'Completed',
          gradingProgress: 'FullyGraded',
        }),
      }
    );
    expect(response.status).toBe(403);
  });

  test('ags_5xx returns a 5xx from AGS', async () => {
    const tool = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const token = await mintToken(origin, tool, [
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    ]);
    const response = await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems/line-1/scores',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/vnd.ims.lis.v1.score+json',
          'x-yawp-lti-fault': 'ags_5xx',
        },
        body: JSON.stringify({
          userId: 'bb-user-student',
          timestamp: '2026-08-20T00:00:00.000Z',
          activityProgress: 'Completed',
          gradingProgress: 'FullyGraded',
        }),
      }
    );
    expect(response.status).toBeGreaterThanOrEqual(500);
  });

  test('ags_timeout delays the AGS response', async () => {
    const tool = generateToolKeys();
    const origin = await listen(
      makePlatform({ toolPublicJwk: tool.publicJwk, timeoutDelayMs: 40 })
    );
    const token = await mintToken(origin, tool, [
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    ]);
    const started = Date.now();
    await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems/line-1/scores?fault=ags_timeout',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/vnd.ims.lis.v1.score+json',
        },
        body: JSON.stringify({
          userId: 'bb-user-student',
          timestamp: '2026-08-20T00:00:00.000Z',
          activityProgress: 'Completed',
          gradingProgress: 'FullyGraded',
        }),
      }
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });
});

describe('token endpoint and AGS', () => {
  test('issues a short-lived token that honors requested scopes', async () => {
    const tool = generateToolKeys();
    const origin = await listen(
      makePlatform({ toolPublicJwk: tool.publicJwk, tokenTtlSeconds: 45 })
    );
    const response = await request(origin, '/api/v1/gateway/oauth2/jwttoken', {
      method: 'POST',
      body: {
        grant_type: 'client_credentials',
        client_assertion_type:
          'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: toolAssertion(origin, tool),
        scope:
          'https://purl.imsglobal.org/spec/lti-ags/scope/score https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      },
    });
    expect(response.status).toBe(200);
    expect(response.json.token_type.toLowerCase()).toBe('bearer');
    expect(response.json.expires_in).toBe(45);
    expect(response.json.scope).toContain(
      'https://purl.imsglobal.org/spec/lti-ags/scope/score'
    );
    expect(response.json.scope).toContain(
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem'
    );
  });

  test('rejects a client_assertion that does not verify against the Tool JWKS', async () => {
    const tool = generateToolKeys();
    const other = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const response = await request(origin, '/api/v1/gateway/oauth2/jwttoken', {
      method: 'POST',
      body: {
        grant_type: 'client_credentials',
        client_assertion_type:
          'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: toolAssertion(origin, other),
        scope: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      },
    });
    expect(response.status).toBe(401);
  });

  test('creates, lists, and reads line items using Blackboard Learn URL shapes', async () => {
    const tool = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const token = await mintToken(origin, tool, [
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
    ]);
    const created = await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
        },
        body: JSON.stringify({
          scoreMaximum: 100,
          label: 'Yawp essay',
          resourceId: 'yawp-essay-1',
          tag: 'essay',
          resourceLinkId: '_99_1',
        }),
      }
    );
    expect(created.status).toBe(201);
    expect(created.json.label).toBe('Yawp essay');
    expect(created.json.id).toContain(
      '/learn/api/v1/lti/courses/_4_1/lineItems/'
    );
    expect(created.headers.get('location')).toBe(created.json.id);

    const listed = await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems',
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(listed.status).toBe(200);
    expect(listed.json).toHaveLength(1);

    const lineItemId = created.json.id.split('/').pop();
    const read = await request(
      origin,
      `/learn/api/v1/lti/courses/_4_1/lineItems/${lineItemId}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(read.status).toBe(200);
    expect(read.json.scoreMaximum).toBe(100);
  });

  test('stores scores and keeps the latest timestamp per user/line item', async () => {
    const tool = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const token = await mintToken(origin, tool, [
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
    ]);
    const created = await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
        },
        body: JSON.stringify({ scoreMaximum: 100, label: 'Essay' }),
      }
    );
    const lineItemId = created.json.id.split('/').pop();
    const scoreUrl = `/learn/api/v1/lti/courses/_4_1/lineItems/${lineItemId}/scores`;

    const first = await request(origin, scoreUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify({
        userId: 'bb-user-student',
        timestamp: '2026-08-20T10:00:00.000Z',
        scoreGiven: 80,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      }),
    });
    expect(first.status).toBe(204);

    const replay = await request(origin, scoreUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify({
        userId: 'bb-user-student',
        timestamp: '2026-08-20T10:00:00.000Z',
        scoreGiven: 80,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      }),
    });
    expect(replay.status).toBe(204);

    const older = await request(origin, scoreUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify({
        userId: 'bb-user-student',
        timestamp: '2026-08-20T09:00:00.000Z',
        scoreGiven: 10,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      }),
    });
    expect(older.status).toBe(204);

    const regrade = await request(origin, scoreUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify({
        userId: 'bb-user-student',
        timestamp: '2026-08-20T11:00:00.000Z',
        scoreGiven: 95,
        scoreMaximum: 100,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
      }),
    });
    expect(regrade.status).toBe(204);

    const inspect = await request(origin, '/dev/scores');
    expect(inspect.json.received).toHaveLength(4);
    expect(inspect.json.current[0].scoreGiven).toBe(95);
    expect(inspect.json.current[0].timestamp).toBe('2026-08-20T11:00:00.000Z');

    const results = await request(
      origin,
      `/learn/api/v1/lti/courses/_4_1/lineItems/${lineItemId}/results`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    expect(results.json[0].resultScore).toBe(95);
  });

  test('AGS returns 403 when the access token is missing the required scope', async () => {
    const tool = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const token = await mintToken(origin, tool, [
      'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
    ]);
    const response = await request(
      origin,
      '/learn/api/v1/lti/courses/_4_1/lineItems',
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
        },
        body: JSON.stringify({ scoreMaximum: 10, label: 'No write' }),
      }
    );
    expect(response.status).toBe(403);
  });
});

describe('deep linking, event log, key rotation, and panel', () => {
  test('verifies a Deep Linking response JWT against the Tool JWKS and records the content item', async () => {
    const tool = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const launch = await completeOidcLaunch(origin, {
      role: 'Instructor',
      ltiMessageHint: Buffer.from(
        JSON.stringify({ messageType: 'LtiDeepLinkingRequest' })
      ).toString('base64url'),
    });
    const { payload } = await verifyAgainstJwks(origin, launch.json.id_token);
    expect(payload['https://purl.imsglobal.org/spec/lti/claim/message_type']).toBe(
      'LtiDeepLinkingRequest'
    );
    const settings =
      payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'];
    expect(settings.deep_link_return_url).toContain('/api/v1/lti/deep-linking');
    expect(settings.data).toBeTruthy();

    const responseJwt = signJwt(
      {
        iss: 'yawp-blackboard-mock',
        aud: 'https://blackboard.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 300,
        nonce: payload.nonce,
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          'yawp-mock-deployment',
        'https://purl.imsglobal.org/spec/lti-dl/claim/data': settings.data,
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
          {
            type: 'ltiResourceLink',
            title: 'Yawp essay',
            url: 'http://127.0.0.1:9/lti/launch',
            lineItem: { scoreMaximum: 100, label: 'Yawp essay' },
          },
        ],
      },
      tool.privateKeyPem,
      { kid: tool.kid }
    );

    const accepted = await request(origin, '/api/v1/lti/deep-linking', {
      method: 'POST',
      body: { JWT: responseJwt },
    });
    expect(accepted.status).toBe(200);
    expect(accepted.json.contentItems[0].title).toBe('Yawp essay');

    const recorded = await request(origin, '/dev/deep-links');
    expect(recorded.json[0].contentItems[0].title).toBe('Yawp essay');
  });

  test('rejects a Deep Linking response signed with the wrong key', async () => {
    const tool = generateToolKeys();
    const other = generateToolKeys();
    const origin = await listen(makePlatform({ toolPublicJwk: tool.publicJwk }));
    const jwt = signJwt(
      {
        iss: 'yawp-blackboard-mock',
        aud: 'https://blackboard.com',
        exp: Math.floor(Date.now() / 1000) + 300,
        iat: Math.floor(Date.now() / 1000),
        'https://purl.imsglobal.org/spec/lti/claim/message_type':
          'LtiDeepLinkingResponse',
        'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
        'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
          'yawp-mock-deployment',
        'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [],
      },
      other.privateKeyPem,
      { kid: other.kid }
    );
    const accepted = await request(origin, '/api/v1/lti/deep-linking', {
      method: 'POST',
      body: { JWT: jwt },
    });
    expect(accepted.status).toBe(401);
  });

  test('records every request on the inspectable event log', async () => {
    const origin = await listen(makePlatform());
    await request(origin, '/healthz');
    await completeOidcLaunch(origin, { nonce: 'logged-nonce' });
    const events = await request(origin, '/dev/events');
    expect(events.json.length).toBeGreaterThanOrEqual(2);
    expect(
      events.json.some((event) => event.path.startsWith('/api/v1/gateway/oidcauth'))
    ).toBe(true);
    expect(JSON.stringify(events.json)).not.toMatch(/BEGIN (RSA )?PRIVATE KEY/);
  });

  test('key rotation publishes the new key while keeping the previous key in JWKS', async () => {
    const origin = await listen(makePlatform());
    const before = (
      await request(
        origin,
        '/api/v1/management/applications/yawp-blackboard-mock/jwks.json'
      )
    ).json;
    const firstKid = before.keys[0].kid;
    await request(origin, '/dev/rotate-keys', { method: 'POST' });
    const after = (
      await request(
        origin,
        '/api/v1/management/applications/yawp-blackboard-mock/jwks.json'
      )
    ).json;
    expect(after.keys).toHaveLength(2);
    expect(after.keys.some((key) => key.kid === firstKid)).toBe(true);
    const launch = await completeOidcLaunch(origin);
    const { header } = decodeUnchecked(launch.json.id_token);
    expect(header.kid).not.toBe(firstKid);
    await verifyAgainstJwks(origin, launch.json.id_token);

    const previous = await completeOidcLaunch(origin, { kid: firstKid });
    expect(decodeUnchecked(previous.json.id_token).header.kid).toBe(firstKid);
    await verifyAgainstJwks(origin, previous.json.id_token);
  });

  test('dev panel HTML exposes launch, score, and fault controls', async () => {
    const origin = await listen(makePlatform());
    const panel = await request(origin, '/');
    expect(panel.status).toBe(200);
    expect(panel.headers.get('content-type')).toContain('text/html');
    expect(panel.text).toContain('data-launch="Learner"');
    expect(panel.text).toContain('data-launch="Instructor"');
    expect(panel.text).toContain('data-launch="Administrator"');
    for (const fault of [
      'expired_launch',
      'replayed_nonce',
      'invalid_jwt',
      'mis_signed_jwt',
      'unknown_deployment',
      'wrong_audience',
      'token_endpoint_failure',
      'ags_403_missing_scope',
      'ags_5xx',
      'ags_timeout',
    ]) {
      expect(panel.text).toContain(`data-fault="${fault}"`);
    }
  });
});

function toolAssertion(origin, tool, extra = {}) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      iss: extra.iss ?? 'yawp-blackboard-mock',
      sub: extra.sub ?? 'yawp-blackboard-mock',
      aud: `${origin}/api/v1/gateway/oauth2/jwttoken`,
      iat: now,
      exp: now + 300,
      jti: `jti-${Math.random().toString(16).slice(2)}`,
      ...extra.claims,
    },
    tool.privateKeyPem,
    { kid: tool.kid }
  );
}

async function mintToken(origin, tool, scopes) {
  const response = await request(origin, '/api/v1/gateway/oauth2/jwttoken', {
    method: 'POST',
    body: {
      grant_type: 'client_credentials',
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: toolAssertion(origin, tool),
      scope: scopes.join(' '),
    },
  });
  expect(response.status).toBe(200);
  return response.json.access_token;
}
