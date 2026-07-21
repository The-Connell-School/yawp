import { afterEach, describe, expect, test } from 'bun:test';
import {
  LTI_CLAIMS,
  LTI_MESSAGE_TYPES,
  createDeepLinkingResponseJwt,
  createLtiClientAssertion,
  requestLtiAccessToken as requestLtiAccessTokenWithTransport,
  verifyLtiLaunchForm as verifyLtiLaunchFormWithTransport,
} from './lti-contract.server';
import {
  LTI_NRPS_MEDIA_TYPE,
  LTI_SCOPES,
  createAgsLineItem as createAgsLineItemWithTransport,
  fetchAllNrpsMemberships as fetchAllNrpsMembershipsWithTransport,
  submitAgsScore as submitAgsScoreWithTransport,
} from './lti-services.server';
import {
  type MockLtiPlatform,
  startMockLtiPlatform,
} from '../../../e2e/mocks/lti/mock-lti-platform';

const platforms: MockLtiPlatform[] = [];
const networkFetch = Bun.fetch as unknown as typeof globalThis.fetch;

function verifyLtiLaunchForm(
  form: Parameters<typeof verifyLtiLaunchFormWithTransport>[0],
  options: Omit<
    Parameters<typeof verifyLtiLaunchFormWithTransport>[1],
    'fetchImpl'
  >,
) {
  return verifyLtiLaunchFormWithTransport(form, {
    ...options,
    fetchImpl: networkFetch,
  });
}

function requestLtiAccessToken(
  input: Omit<
    Parameters<typeof requestLtiAccessTokenWithTransport>[0],
    'fetchImpl'
  >,
) {
  return requestLtiAccessTokenWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

function fetchAllNrpsMemberships(
  input: Omit<
    Parameters<typeof fetchAllNrpsMembershipsWithTransport>[0],
    'fetchImpl'
  >,
) {
  return fetchAllNrpsMembershipsWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

function createAgsLineItem(
  input: Omit<
    Parameters<typeof createAgsLineItemWithTransport>[0],
    'fetchImpl'
  >,
) {
  return createAgsLineItemWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

function submitAgsScore(
  input: Omit<
    Parameters<typeof submitAgsScoreWithTransport>[0],
    'fetchImpl'
  >,
) {
  return submitAgsScoreWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

afterEach(async () => {
  await Promise.all(platforms.splice(0).map((platform) => platform.close()));
});

async function startPlatform() {
  const platform = await startMockLtiPlatform();
  platforms.push(platform);
  return platform;
}

function extractFormPost(html: string) {
  const fields = Object.fromEntries(
    [...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [
      match[1],
      match[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    ])
  );

  if (!fields.id_token || !fields.state) {
    throw new Error('Mock platform did not return an OIDC form_post response.');
  }

  return { idToken: fields.id_token, state: fields.state };
}

async function authorize(
  platform: MockLtiPlatform,
  scenario = 'instructor-resource-link'
) {
  const url = new URL(platform.registration.authorizationEndpoint);
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('prompt', 'none');
  url.searchParams.set('client_id', platform.registration.clientId);
  url.searchParams.set('redirect_uri', platform.registration.targetLinkUri);
  url.searchParams.set('login_hint', 'login-kevin');
  url.searchParams.set('lti_message_hint', scenario);
  url.searchParams.set('state', 'state-contract-001');
  url.searchParams.set('nonce', 'nonce-contract-001');

  const response = await networkFetch(url);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  return extractFormPost(await response.text());
}

describe('LTI 1.3 launch over the network boundary', () => {
  test('verifies and normalizes a signed Blackboard-shaped resource launch', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform);

    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
      nowSeconds: platform.seed.nowSeconds,
    });

    expect(launch).toEqual({
      issuer: platform.baseUrl,
      subject: 'lti-instructor-kevin',
      audience: ['yawp-summer-client'],
      deploymentId: 'deployment-blackboard-001',
      messageType: 'LtiResourceLinkRequest',
      version: '1.3.0',
      targetLinkUri: platform.registration.targetLinkUri,
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
      context: {
        id: 'course-eng-101',
        label: 'ENG-101',
        title: 'English Composition I',
      },
      resourceLink: {
        id: 'resource-argument-essay-001',
        title: 'Argument Essay',
      },
      person: {
        email: 'kevin.instructor@example.test',
        givenName: 'Kevin',
        familyName: 'Instructor',
        name: 'Kevin Instructor',
      },
      services: {
        membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
        nrpsVersions: ['2.0'],
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl: null,
        agsScopes: [
          LTI_SCOPES.lineItem,
          LTI_SCOPES.resultReadonly,
          LTI_SCOPES.score,
        ],
      },
      custom: { yawp_assignment_kind: 'argument-essay' },
      deepLinking: null,
    });

    expect(platform.journal[0]).toMatchObject({
      method: 'GET',
      path: '/oidc/auth',
    });
    expect(platform.journal[1]).toMatchObject({
      method: 'GET',
      path: '/.well-known/jwks.json',
    });
  });

  test('preserves role separation and tolerates missing optional PII', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'learner-resource-link-no-pii');

    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
      nowSeconds: platform.seed.nowSeconds,
    });

    expect(launch.subject).toBe('lti-learner-ada');
    expect(launch.roles).toEqual([
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
    ]);
    expect(launch.person).toEqual({
      email: null,
      givenName: null,
      familyName: null,
      name: null,
    });
  });

  test.each([
    ['wrong-deployment', 'deployment'],
    ['wrong-audience', 'audience'],
    ['wrong-nonce', 'nonce'],
    ['expired', 'expired'],
    ['future-issued-at', 'issued-at'],
    ['wrong-target', 'target'],
    ['untrusted-service-origin', 'service origin'],
    ['alg-none', 'algorithm'],
    ['jku-header', 'JOSE header'],
    ['unknown-kid', 'signing key'],
  ])('fail-closes the %s launch scenario', async (scenario, message) => {
    const platform = await startPlatform();
    const form = await authorize(platform, scenario);

    await expect(
      verifyLtiLaunchForm(form, {
        registration: platform.registration,
        expectedState: 'state-contract-001',
        expectedNonce: 'nonce-contract-001',
        expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).rejects.toThrow(message);
  });

  test('rejects a changed form state before fetching provider keys', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform);

    await expect(
      verifyLtiLaunchForm(
        { ...form, state: 'attacker-state' },
        {
          registration: platform.registration,
          expectedState: 'state-contract-001',
          expectedNonce: 'nonce-contract-001',
          expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
          nowSeconds: platform.seed.nowSeconds,
        }
      )
    ).rejects.toThrow('state');

    expect(
      platform.journal.filter((entry) => entry.path.includes('jwks'))
    ).toHaveLength(0);
  });

  test('rejects a provider JWKS outage without accepting token-supplied keys', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform);
    platform.failNext('jwks', { status: 503, body: 'provider unavailable' });

    await expect(
      verifyLtiLaunchForm(form, {
        registration: platform.registration,
        expectedState: 'state-contract-001',
        expectedNonce: 'nonce-contract-001',
        expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).rejects.toThrow('JWKS');
  });

  test('normalizes a signed Deep Linking request and returns signed content', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'deep-link');

    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedMessageType: LTI_MESSAGE_TYPES.deepLinkingRequest,
      nowSeconds: platform.seed.nowSeconds,
    });
    expect(launch.resourceLink).toBeNull();
    expect(launch.deepLinking).toEqual({
      returnUrl: `${platform.baseUrl}/deep-link/return`,
      acceptTypes: ['ltiResourceLink'],
      documentTargets: ['iframe', 'window'],
      acceptsMultiple: true,
      autoCreate: false,
      data: 'opaque-deep-link-data-001',
    });

    const responseJwt = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      data: launch.deepLinking?.data ?? '',
      contentItems: [platform.seed.contentItem],
      nowSeconds: platform.seed.nowSeconds,
    });
    const response = await networkFetch(launch.deepLinking!.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: responseJwt }),
    });

    expect(response.status).toBe(204);
    expect(platform.state.deepLinkContentItems).toEqual([
      platform.seed.contentItem,
    ]);
    expect(JSON.stringify(platform.journal)).not.toContain(responseJwt);
  });
});

describe('LTI Advantage service authentication and roster shape', () => {
  test('uses a signed client assertion and follows real NRPS pagination', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-001',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      tokenEndpoint: platform.registration.tokenEndpoint,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
    });

    const memberships = await fetchAllNrpsMemberships({
      membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships?limit=2`,
      accessToken: token.accessToken,
    });

    expect(token).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 300,
      scope: LTI_SCOPES.contextMembershipReadonly,
    });
    expect(memberships.context).toEqual({
      id: 'course-eng-101',
      label: 'ENG-101',
      title: 'English Composition I',
    });
    expect(memberships.members.map((member) => member.userId)).toEqual([
      'lti-instructor-kevin',
      'lti-learner-ada',
      'lti-learner-james',
      'lti-learner-inactive',
    ]);
    expect(
      platform.journal.filter((entry) => entry.path.includes('memberships'))
    ).toHaveLength(2);
    expect(platform.journal.some((entry) => entry.secretsRedacted)).toBe(true);
  });

  test('rejects unauthorized scopes and missing bearer tokens', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-unauthorized',
      nowSeconds: platform.seed.nowSeconds,
    });

    await expect(
      requestLtiAccessToken({
        tokenEndpoint: platform.registration.tokenEndpoint,
        clientAssertion: assertion,
        scopes: ['https://example.test/scope/admin'],
      })
    ).rejects.toThrow('scope');

    const response = await networkFetch(
      `${platform.baseUrl}/contexts/course-eng-101/memberships`,
      { headers: { accept: LTI_NRPS_MEDIA_TYPE } }
    );
    expect(response.status).toBe(401);
  });

  test('surfaces malformed provider JSON as a contract error', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-malformed',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      tokenEndpoint: platform.registration.tokenEndpoint,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
    });
    platform.failNext('nrps', {
      status: 200,
      body: '{not valid json',
      contentType: LTI_NRPS_MEDIA_TYPE,
    });

    await expect(
      fetchAllNrpsMemberships({
        membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
        accessToken: token.accessToken,
      })
    ).rejects.toThrow('NRPS');
  });

  test('does not leak assertions or bearer tokens to the request journal', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-redaction',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      tokenEndpoint: platform.registration.tokenEndpoint,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
    });
    await fetchAllNrpsMemberships({
      membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
      accessToken: token.accessToken,
    });

    const journal = JSON.stringify(platform.journal);
    expect(journal).not.toContain(assertion);
    expect(journal).not.toContain(token.accessToken);
    expect(journal).not.toContain(platform.tool.privateKeyPem);
    expect(journal).not.toContain('"client_assertion":');
  });

  test('creates a line item and deduplicates an AGS score over HTTP', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-ags',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      tokenEndpoint: platform.registration.tokenEndpoint,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItem, LTI_SCOPES.score],
    });

    const lineItem = await createAgsLineItem({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      accessToken: token.accessToken,
      lineItem: {
        scoreMaximum: 100,
        label: 'Yawp Network Contract',
        resourceId: 'resource-network-contract-001',
        tag: 'yawp-contract',
      },
    });
    const score = {
      userId: 'lti-learner-ada',
      scoreGiven: 91,
      scoreMaximum: 100,
      activityProgress: 'Completed' as const,
      gradingProgress: 'FullyGraded' as const,
      timestamp: '2026-07-21T12:00:00.000Z',
    };
    await submitAgsScore({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      idempotencyKey: 'grade-release-ada-001',
      score,
    });
    await submitAgsScore({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      idempotencyKey: 'grade-release-ada-001',
      score,
    });

    expect(lineItem).toMatchObject({
      label: 'Yawp Network Contract',
      scoreMaximum: 100,
    });
    expect(platform.state.scores.size).toBe(1);
    expect(platform.state.scores.get('grade-release-ada-001')).toMatchObject({
      userId: 'lti-learner-ada',
      scoreGiven: 91,
      gradingProgress: 'FullyGraded',
    });
  });

  test('surfaces provider throttling and does not retry unsafe AGS writes itself', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-ags-throttle',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      tokenEndpoint: platform.registration.tokenEndpoint,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItem],
    });
    platform.failNext('ags', {
      status: 429,
      body: JSON.stringify({ error: 'rate_limited' }),
      contentType: 'application/json',
    });

    await expect(
      createAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        accessToken: token.accessToken,
        lineItem: {
          scoreMaximum: 100,
          label: 'Throttled item',
          resourceId: 'resource-throttled-001',
          tag: 'yawp-contract',
        },
      })
    ).rejects.toThrow('429');
    expect(
      platform.journal.filter((entry) => entry.path.endsWith('/lineitems'))
    ).toHaveLength(1);
  });

  test('uses the normative LTI claim names', () => {
    expect(LTI_CLAIMS.deploymentId).toBe(
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id'
    );
    expect(LTI_CLAIMS.namesRoleService).toBe(
      'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'
    );
  });
});
