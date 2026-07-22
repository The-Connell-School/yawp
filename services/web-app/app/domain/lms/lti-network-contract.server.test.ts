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
  LTI_AGS_LINE_ITEM_MEDIA_TYPE,
  LTI_NRPS_MEDIA_TYPE,
  LTI_SCOPES,
  createAgsLineItem as createAgsLineItemWithTransport,
  fetchAllNrpsMemberships as fetchAllNrpsMembershipsWithTransport,
  getAgsLineItem as getAgsLineItemWithTransport,
  submitAgsScore as submitAgsScoreWithTransport,
  updateAgsLineItem as updateAgsLineItemWithTransport,
} from './lti-services.server';
import { LtiHttpError } from './lti-http.server';
import {
  type MockLtiPlatform,
  type MockHttpCaptureServer,
  startMockHttpCaptureServer,
  startMockLtiPlatform,
} from '../../../e2e/mocks/lti/mock-lti-platform';

const platforms: MockLtiPlatform[] = [];
const captureServers: MockHttpCaptureServer[] = [];
const networkFetch = Bun.fetch as unknown as typeof globalThis.fetch;

function verifyLtiLaunchForm(
  form: Parameters<typeof verifyLtiLaunchFormWithTransport>[0],
  options: Omit<
    Parameters<typeof verifyLtiLaunchFormWithTransport>[1],
    'fetchImpl'
  >
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
  >
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
  >
) {
  return fetchAllNrpsMembershipsWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

function createAgsLineItem(
  input: Omit<Parameters<typeof createAgsLineItemWithTransport>[0], 'fetchImpl'>
) {
  return createAgsLineItemWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

function submitAgsScore(
  input: Omit<Parameters<typeof submitAgsScoreWithTransport>[0], 'fetchImpl'>
) {
  return submitAgsScoreWithTransport({
    ...input,
    fetchImpl: networkFetch,
  });
}

function getAgsLineItem(
  input: Omit<Parameters<typeof getAgsLineItemWithTransport>[0], 'fetchImpl'>
) {
  return getAgsLineItemWithTransport({ ...input, fetchImpl: networkFetch });
}

function updateAgsLineItem(
  input: Omit<Parameters<typeof updateAgsLineItemWithTransport>[0], 'fetchImpl'>
) {
  return updateAgsLineItemWithTransport({ ...input, fetchImpl: networkFetch });
}

afterEach(async () => {
  await Promise.all([
    ...platforms.splice(0).map((platform) => platform.close()),
    ...captureServers.splice(0).map((server) => server.close()),
  ]);
});

async function startPlatform() {
  const platform = await startMockLtiPlatform();
  platforms.push(platform);
  return platform;
}

function extractFormPost(html: string) {
  const action = html.match(/<form[^>]+action="([^"]+)"/)?.[1];
  const fields = Object.fromEntries(
    [...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [
      match[1],
      match[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    ])
  );

  if (!action || !fields.id_token || !fields.state) {
    throw new Error('Mock platform did not return an OIDC form_post response.');
  }

  return { action, idToken: fields.id_token, state: fields.state };
}

async function authorize(
  platform: MockLtiPlatform,
  scenario = 'instructor-resource-link'
) {
  const url = new URL(platform.registration.authorizationEndpoint);
  const targetLinkUri = scenario.startsWith('deep-link')
    ? platform.registration.deepLinkingLaunchUrl
    : platform.registration.launchUrl;
  url.searchParams.set('scope', 'openid');
  url.searchParams.set('response_type', 'id_token');
  url.searchParams.set('response_mode', 'form_post');
  url.searchParams.set('prompt', 'none');
  url.searchParams.set('client_id', platform.registration.clientId);
  url.searchParams.set('redirect_uri', targetLinkUri);
  url.searchParams.set('login_hint', 'login-kevin');
  url.searchParams.set('lti_message_hint', scenario);
  url.searchParams.set('state', 'state-contract-001');
  url.searchParams.set('nonce', 'nonce-contract-001');

  const response = await networkFetch(url);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain('text/html');
  const form = extractFormPost(await response.text());
  const callback = await networkFetch(form.action, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ id_token: form.idToken, state: form.state }),
  });
  expect(callback.status).toBe(200);
  return (await callback.json()) as { idToken: string; state: string };
}

describe('LTI 1.3 launch over the network boundary', () => {
  test('verifies and normalizes a signed Blackboard-shaped resource launch', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform);

    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.launchUrl,
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
      targetLinkUri: platform.registration.launchUrl,
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
    expect(platform.tool.launchRequests[0]).toMatchObject({
      path: '/lti/launch',
      contentType: 'application/x-www-form-urlencoded',
      state: 'state-contract-001',
    });
  });

  test('preserves role separation and tolerates missing optional PII', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'learner-resource-link-no-pii');

    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.launchUrl,
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
        expectedTargetLinkUri: platform.registration.launchUrl,
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
          expectedTargetLinkUri: platform.registration.launchUrl,
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
        expectedTargetLinkUri: platform.registration.launchUrl,
        expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).rejects.toThrow('JWKS');
  });

  test('rejects disabled registrations before any provider request', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform);
    platform.journal.splice(0);

    await expect(
      verifyLtiLaunchForm(form, {
        registration: { ...platform.registration, enabled: false },
        expectedState: 'state-contract-001',
        expectedNonce: 'nonce-contract-001',
        expectedTargetLinkUri: platform.registration.launchUrl,
        expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).rejects.toThrow('disabled');
    expect(platform.journal).toHaveLength(0);
  });

  test.each([
    ['stale-issued-at', 'too old'],
    ['excessive-lifetime', 'lifetime'],
    ['untrusted-additional-audience', 'audience'],
    ['wrong-authorized-party', 'authorized-party'],
  ])('rejects bounded-token scenario %s', async (scenario, message) => {
    const platform = await startPlatform();
    const form = await authorize(platform, scenario);
    await expect(
      verifyLtiLaunchForm(form, {
        registration: platform.registration,
        expectedState: 'state-contract-001',
        expectedNonce: 'nonce-contract-001',
        expectedTargetLinkUri: platform.registration.launchUrl,
        expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).rejects.toThrow(message);
  });

  test('accepts a standards-valid empty roles array without granting a role', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'empty-roles');
    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.launchUrl,
      expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
      nowSeconds: platform.seed.nowSeconds,
    });
    expect(launch.roles).toEqual([]);
  });

  test('normalizes a signed Deep Linking request and returns signed content', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'deep-link');

    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.deepLinkingLaunchUrl,
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

  test('round-trips a Deep Linking request that omits optional data', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'deep-link-no-data');
    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.deepLinkingLaunchUrl,
      expectedMessageType: LTI_MESSAGE_TYPES.deepLinkingRequest,
      nowSeconds: platform.seed.nowSeconds,
    });
    expect(launch.deepLinking?.data).toBeNull();

    const responseJwt = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      data: launch.deepLinking?.data,
      contentItems: [platform.seed.contentItem],
      nowSeconds: platform.seed.nowSeconds,
    });
    const response = await networkFetch(launch.deepLinking!.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: responseJwt }),
    });
    expect(response.status).toBe(204);
  });
});

describe('LTI Advantage service authentication and roster shape', () => {
  test('uses a signed client assertion and follows real NRPS pagination', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-001',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
    });

    const memberships = await fetchAllNrpsMemberships({
      membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships?limit=2`,
      accessToken: token.accessToken,
      registration: platform.registration,
      expectedContextId: 'course-eng-101',
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
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-unauthorized',
      nowSeconds: platform.seed.nowSeconds,
    });

    await expect(
      requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: ['https://example.test/scope/admin'],
        advertisedScopes: ['https://example.test/scope/admin'],
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
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-malformed',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
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
        registration: platform.registration,
        expectedContextId: 'course-eng-101',
      })
    ).rejects.toThrow('NRPS');
  });

  test('aborts a provider request at the configured deadline', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-timeout',
      nowSeconds: platform.seed.nowSeconds,
    });
    platform.failNext('token', {
      status: 200,
      delayMs: 50,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'too-late',
        token_type: 'Bearer',
        expires_in: 300,
        scope: LTI_SCOPES.lineItem,
      }),
    });

    let caught: unknown;
    try {
      await requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.lineItem],
        advertisedScopes: [LTI_SCOPES.lineItem],
        timeoutMs: 10,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LtiHttpError);
    expect(caught).toMatchObject({
      operation: 'LTI token endpoint',
      status: null,
      retryAfter: null,
    });
    expect((caught as Error).message).toContain('timed out');
  });

  test('rejects a roster whose context differs from the signed launch', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-context-confusion',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
    });
    platform.failNext('nrps', {
      status: 200,
      contentType: LTI_NRPS_MEDIA_TYPE,
      body: JSON.stringify({
        id: `${platform.baseUrl}/contexts/course-other/memberships`,
        context: { id: 'course-other' },
        members: [],
      }),
    });

    await expect(
      fetchAllNrpsMemberships({
        membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
        accessToken: token.accessToken,
        registration: platform.registration,
        expectedContextId: 'course-eng-101',
      })
    ).rejects.toThrow('context');
  });

  test('follows standards-valid relative NRPS pagination links with extra parameters', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-complex-link',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
    });
    const roster = await fetchAllNrpsMemberships({
      membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships?limit=2&linkStyle=complex`,
      accessToken: token.accessToken,
      registration: platform.registration,
      expectedContextId: 'course-eng-101',
    });
    expect(roster.members).toHaveLength(4);
  });

  test('rejects token scopes that exceed tenant approval or launch advertisement', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-scope-bounds',
      nowSeconds: platform.seed.nowSeconds,
    });

    await expect(
      requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.score],
        advertisedScopes: [LTI_SCOPES.lineItem],
      })
    ).rejects.toThrow('advertised');

    await expect(
      requestLtiAccessToken({
        registration: {
          ...platform.registration,
          enabledScopes: [LTI_SCOPES.lineItem],
        },
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.score],
        advertisedScopes: [LTI_SCOPES.score],
      })
    ).rejects.toThrow('approved');
  });

  test('rejects an over-broad scope returned by the token endpoint', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-overbroad-response',
      nowSeconds: platform.seed.nowSeconds,
    });
    platform.failNext('token', {
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'overbroad-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: `${LTI_SCOPES.lineItem} ${LTI_SCOPES.score}`,
      }),
    });
    await expect(
      requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.lineItem],
        advertisedScopes: [LTI_SCOPES.lineItem],
      })
    ).rejects.toThrow('returned scope');
  });

  test('does not leak assertions or bearer tokens to the request journal', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-redaction',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
    });
    await fetchAllNrpsMemberships({
      membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
      accessToken: token.accessToken,
      registration: platform.registration,
      expectedContextId: 'course-eng-101',
    });

    const journal = JSON.stringify(platform.journal);
    expect(journal).not.toContain(assertion);
    expect(journal).not.toContain(token.accessToken);
    expect(journal).not.toContain(platform.tool.privateKeyPem);
    expect(journal).not.toContain('"client_assertion":');
  });

  test('creates, reads, updates a line item and records real AGS writes over HTTP', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-ags',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItem, LTI_SCOPES.score],
      advertisedScopes: [LTI_SCOPES.lineItem, LTI_SCOPES.score],
    });

    const lineItem = await createAgsLineItem({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      accessToken: token.accessToken,
      registration: platform.registration,
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
    expect(
      await getAgsLineItem({
        lineItemUrl: lineItem.id,
        accessToken: token.accessToken,
        registration: platform.registration,
      })
    ).toEqual(lineItem);
    const updated = await updateAgsLineItem({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      registration: platform.registration,
      lineItem: { ...lineItem, label: 'Yawp Network Contract Updated' },
    });
    expect(updated).toMatchObject({
      id: lineItem.id,
      label: 'Yawp Network Contract Updated',
    });
    await submitAgsScore({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      registration: platform.registration,
      score,
    });
    await submitAgsScore({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      registration: platform.registration,
      score,
    });

    expect(lineItem).toMatchObject({
      label: 'Yawp Network Contract',
      scoreMaximum: 100,
    });
    expect(platform.state.scores).toHaveLength(2);
    expect(platform.state.scores[0]).toMatchObject({
      userId: 'lti-learner-ada',
      scoreGiven: 91,
      gradingProgress: 'FullyGraded',
    });
  });

  test('enforces provider media types at the real HTTP boundary', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-media-types',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly, LTI_SCOPES.lineItem],
      advertisedScopes: [
        LTI_SCOPES.contextMembershipReadonly,
        LTI_SCOPES.lineItem,
      ],
    });

    const rosterResponse = await networkFetch(
      `${platform.baseUrl}/contexts/course-eng-101/memberships`,
      {
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${token.accessToken}`,
        },
      }
    );
    expect(rosterResponse.status).toBe(406);

    const lineItemResponse = await networkFetch(
      `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      {
        method: 'POST',
        headers: {
          accept: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
          authorization: `Bearer ${token.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ scoreMaximum: 100, label: 'Wrong media type' }),
      }
    );
    expect(lineItemResponse.status).toBe(415);
  });

  test('rejects an AGS success response with the wrong media type', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-provider-media-type',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItem],
      advertisedScopes: [LTI_SCOPES.lineItem],
    });
    platform.failNext('ags', {
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: `${platform.baseUrl}/lineitems/wrong-media-type`,
        scoreMaximum: 100,
        label: 'Wrong provider media type',
      }),
    });

    await expect(
      createAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        accessToken: token.accessToken,
        registration: platform.registration,
        lineItem: { scoreMaximum: 100, label: 'Expected media type' },
      })
    ).rejects.toThrow('media type');
  });

  test('supports progress-only scores and rejects negative scores before network I/O', async () => {
    const platform = await startPlatform();
    const before = platform.journal.length;
    await expect(
      submitAgsScore({
        lineItemUrl: `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`,
        accessToken: 'unused',
        registration: platform.registration,
        score: {
          userId: 'lti-learner-ada',
          scoreGiven: -1,
          scoreMaximum: 100,
          activityProgress: 'Completed',
          gradingProgress: 'FullyGraded',
          timestamp: '2026-07-21T12:00:00.000Z',
        },
      })
    ).rejects.toThrow();
    expect(platform.journal).toHaveLength(before);

    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-progress-only',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.score],
      advertisedScopes: [LTI_SCOPES.score],
    });
    await submitAgsScore({
      lineItemUrl: `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`,
      accessToken: token.accessToken,
      registration: platform.registration,
      score: {
        userId: 'lti-learner-ada',
        activityProgress: 'InProgress',
        gradingProgress: 'Pending',
        timestamp: '2026-07-21T12:00:00.000Z',
      },
    });
    expect(platform.state.scores.at(-1)).toMatchObject({
      userId: 'lti-learner-ada',
      activityProgress: 'InProgress',
    });
  });

  test('rejects cross-origin line-item IDs without leaking a bearer token', async () => {
    const platform = await startPlatform();
    const capture = await startMockHttpCaptureServer();
    captureServers.push(capture);
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-cross-origin-lineitem',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItem, LTI_SCOPES.score],
      advertisedScopes: [LTI_SCOPES.lineItem, LTI_SCOPES.score],
    });
    platform.failNext('ags', {
      status: 201,
      contentType: 'application/vnd.ims.lis.v2.lineitem+json',
      body: JSON.stringify({
        id: `${capture.baseUrl}/stolen-lineitem`,
        scoreMaximum: 100,
        label: 'Attacker item',
      }),
    });

    await expect(
      createAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        accessToken: token.accessToken,
        registration: platform.registration,
        lineItem: { scoreMaximum: 100, label: 'Expected item' },
      })
    ).rejects.toThrow('origin');
    expect(capture.requests).toHaveLength(0);
  });

  test('does not follow a token redirect carrying the signed client assertion', async () => {
    const platform = await startPlatform();
    const capture = await startMockHttpCaptureServer();
    captureServers.push(capture);
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-no-redirect',
      nowSeconds: platform.seed.nowSeconds,
    });
    platform.failNext('token', {
      status: 307,
      body: '',
      headers: { location: `${capture.baseUrl}/steal-token` },
    });

    await expect(
      requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.lineItem],
        advertisedScopes: [LTI_SCOPES.lineItem],
      })
    ).rejects.toThrow();
    expect(capture.requests).toHaveLength(0);
  });

  test('surfaces provider throttling and does not retry unsafe AGS writes itself', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-contract-ags-throttle',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItem],
      advertisedScopes: [LTI_SCOPES.lineItem],
    });
    platform.failNext('ags', {
      status: 429,
      body: JSON.stringify({ error: 'rate_limited' }),
      contentType: 'application/json',
      headers: { 'retry-after': '2' },
    });

    let caught: unknown;
    try {
      await createAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        accessToken: token.accessToken,
        registration: platform.registration,
        lineItem: {
          scoreMaximum: 100,
          label: 'Throttled item',
          resourceId: 'resource-throttled-001',
          tag: 'yawp-contract',
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LtiHttpError);
    expect(caught).toMatchObject({
      operation: 'AGS line-item request',
      status: 429,
      retryAfter: '2',
    });
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
