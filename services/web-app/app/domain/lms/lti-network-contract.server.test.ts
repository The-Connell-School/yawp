import { afterEach, describe, expect, test } from 'bun:test';
import {
  LTI_CLAIMS,
  LTI_MESSAGE_TYPES,
  assertLtiAccessGrant,
  createDeepLinkingResponseJwt,
  createLtiClientAssertion,
  requestLtiAccessToken,
  signLtiJwt,
  verifyLtiLaunchForm,
} from './lti-contract.server';
import {
  LTI_AGS_LINE_ITEM_MEDIA_TYPE,
  LTI_NRPS_MEDIA_TYPE,
  LTI_SCOPES,
  createAgsLineItem,
  fetchAllAgsLineItems,
  fetchAllNrpsMemberships,
  getAgsLineItem,
  submitAgsScore,
  updateAgsLineItem,
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
        agsScopes: [LTI_SCOPES.lineItem, LTI_SCOPES.score],
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
    ['future-not-before', 'not yet valid'],
    ['expiry-before-issued-at', 'after its issued-at'],
    ['not-before-after-expiry', 'precede expiry'],
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
      acceptLineItem: true,
      data: 'opaque-deep-link-data-001',
    });

    const responseJwt = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      nonce: 'deep-link-response-contract-001',
      data: launch.deepLinking?.data ?? '',
      contentItems: [platform.seed.contentItem],
      acceptTypes: launch.deepLinking!.acceptTypes,
      documentTargets: launch.deepLinking!.documentTargets,
      acceptsMultiple: launch.deepLinking!.acceptsMultiple,
      acceptLineItem: launch.deepLinking!.acceptLineItem,
      nowSeconds: platform.seed.nowSeconds,
    });
    const missingDataJwt = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      nonce: 'deep-link-response-missing-data',
      contentItems: [platform.seed.contentItem],
      acceptTypes: launch.deepLinking!.acceptTypes,
      documentTargets: launch.deepLinking!.documentTargets,
      acceptsMultiple: launch.deepLinking!.acceptsMultiple,
      acceptLineItem: launch.deepLinking!.acceptLineItem,
      nowSeconds: platform.seed.nowSeconds,
    });
    const missingDataResponse = await networkFetch(
      launch.deepLinking!.returnUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ JWT: missingDataJwt }),
      }
    );
    expect(missingDataResponse.status).toBe(400);
    const response = await networkFetch(launch.deepLinking!.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: responseJwt }),
    });

    expect(response.status).toBe(204);
    const replay = await networkFetch(launch.deepLinking!.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: responseJwt }),
    });
    expect(replay.status).toBe(400);
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
      nonce: 'deep-link-response-contract-002',
      data: launch.deepLinking?.data,
      contentItems: [platform.seed.contentItem],
      acceptTypes: launch.deepLinking!.acceptTypes,
      documentTargets: launch.deepLinking!.documentTargets,
      acceptsMultiple: launch.deepLinking!.acceptsMultiple,
      acceptLineItem: launch.deepLinking!.acceptLineItem,
      nowSeconds: platform.seed.nowSeconds,
    });
    const response = await networkFetch(launch.deepLinking!.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: responseJwt }),
    });
    expect(response.status).toBe(204);
  });

  test('preserves a present empty Deep Linking data value exactly', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'deep-link-empty-data');
    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.deepLinkingLaunchUrl,
      expectedMessageType: LTI_MESSAGE_TYPES.deepLinkingRequest,
      nowSeconds: platform.seed.nowSeconds,
    });
    expect(launch.deepLinking?.data).toBe('');
    const jwt = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      nonce: 'deep-link-response-empty-data',
      data: launch.deepLinking!.data,
      contentItems: [],
      acceptTypes: launch.deepLinking!.acceptTypes,
      documentTargets: launch.deepLinking!.documentTargets,
      acceptsMultiple: launch.deepLinking!.acceptsMultiple,
      acceptLineItem: launch.deepLinking!.acceptLineItem,
      nowSeconds: platform.seed.nowSeconds,
    });
    const response = await networkFetch(launch.deepLinking!.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: jwt }),
    });
    expect(response.status).toBe(204);
  });

  test('accepts a Deep Linking no-selection response without content_items', async () => {
    const platform = await startPlatform();
    await authorize(platform, 'deep-link-no-data');
    const jwt = signLtiJwt({
      header: { kid: platform.tool.keyId },
      payload: {
        iss: platform.registration.clientId,
        aud: platform.registration.issuer,
        iat: platform.seed.nowSeconds,
        exp: platform.seed.nowSeconds + 300,
        nonce: 'deep-link-response-no-selection',
        [LTI_CLAIMS.deploymentId]: platform.registration.deploymentId,
        [LTI_CLAIMS.messageType]: LTI_MESSAGE_TYPES.deepLinkingResponse,
        [LTI_CLAIMS.version]: '1.3.0',
      },
      privateKeyPem: platform.tool.privateKeyPem,
    });
    const response = await networkFetch(
      `${platform.baseUrl}/deep-link/return`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ JWT: jwt }),
      }
    );
    expect(response.status).toBe(204);
    expect(platform.state.deepLinkContentItems).toEqual([]);
  });

  test('accepts a minimal Deep Linking request without subject, roles, or context', async () => {
    const platform = await startPlatform();
    const form = await authorize(platform, 'deep-link-minimal');
    const launch = await verifyLtiLaunchForm(form, {
      registration: platform.registration,
      expectedState: 'state-contract-001',
      expectedNonce: 'nonce-contract-001',
      expectedTargetLinkUri: platform.registration.deepLinkingLaunchUrl,
      expectedMessageType: LTI_MESSAGE_TYPES.deepLinkingRequest,
      nowSeconds: platform.seed.nowSeconds,
    });

    expect(launch.subject).toBeNull();
    expect(launch.roles).toEqual([]);
    expect(launch.context).toBeNull();
  });

  test('accepts the minimal standards-valid LTI resource link shape', async () => {
    const platform = await startPlatform();
    await authorize(platform, 'deep-link');
    const jwt = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      nonce: 'deep-link-response-minimal-item',
      data: 'opaque-deep-link-data-001',
      contentItems: [
        {
          type: 'ltiResourceLink',
          lineItem: { scoreMaximum: 10 },
          'https://example.test/deep-link-extension': { value: true },
        },
      ],
      acceptTypes: ['ltiResourceLink'],
      documentTargets: [],
      acceptsMultiple: false,
      acceptLineItem: true,
      nowSeconds: platform.seed.nowSeconds,
    });

    const response = await networkFetch(
      `${platform.baseUrl}/deep-link/return`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ JWT: jwt }),
      }
    );
    expect(response.status).toBe(204);
  });

  test('rejects content outside the Deep Linking capabilities before network I/O', async () => {
    const platform = await startPlatform();
    expect(() =>
      createDeepLinkingResponseJwt({
        clientId: platform.registration.clientId,
        platformIssuer: platform.registration.issuer,
        deploymentId: platform.registration.deploymentId,
        privateKeyPem: platform.tool.privateKeyPem,
        keyId: platform.tool.keyId,
        nonce: 'deep-link-response-capability-negative',
        contentItems: [platform.seed.contentItem],
        acceptTypes: ['ltiResourceLink'],
        documentTargets: ['iframe', 'window'],
        acceptsMultiple: true,
        acceptLineItem: false,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).toThrow('line items');

    expect(() =>
      createDeepLinkingResponseJwt({
        clientId: platform.registration.clientId,
        platformIssuer: platform.registration.issuer,
        deploymentId: platform.registration.deploymentId,
        privateKeyPem: platform.tool.privateKeyPem,
        keyId: platform.tool.keyId,
        nonce: 'deep-link-response-document-target-negative',
        contentItems: [{ type: 'ltiResourceLink', iframe: { height: 720 } }],
        acceptTypes: ['ltiResourceLink'],
        documentTargets: ['window'],
        acceptsMultiple: false,
        acceptLineItem: false,
        nowSeconds: platform.seed.nowSeconds,
      })
    ).toThrow('iframe');
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
      grant: token,
      registration: platform.registration,
      expectedContextId: 'course-eng-101',
    });

    expect(token).toMatchObject({
      tokenType: 'Bearer',
      expiresIn: 300,
      scope: LTI_SCOPES.contextMembershipReadonly,
    });
    expect(platform.tool.jwksRequests).toContainEqual({
      method: 'GET',
      path: '/.well-known/jwks.json',
    });
    expect(() =>
      assertLtiAccessGrant(
        token,
        platform.registration,
        LTI_SCOPES.contextMembershipReadonly,
        token.expiresAtEpochSeconds
      )
    ).toThrow('expired');
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

  test('fails token exchange when the platform cannot retrieve tool JWKS', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-tool-jwks-outage',
      nowSeconds: platform.seed.nowSeconds,
    });
    platform.failNext('tool-jwks', { status: 503 });

    await expect(
      requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.lineItem],
        advertisedScopes: [LTI_SCOPES.lineItem],
      })
    ).rejects.toMatchObject({ status: 401 });
    expect(platform.tool.jwksRequests).toHaveLength(1);
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
        grant: token,
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
      headersFirstDelayMs: 50,
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

  test('stops reading a chunked provider response at the body limit', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-body-limit',
      nowSeconds: platform.seed.nowSeconds,
    });
    platform.failNext('token', {
      status: 200,
      contentType: 'application/json',
      bodyChunks: ['{"padding":"', 'x'.repeat(600_000), 'y'.repeat(600_000)],
    });

    await expect(
      requestLtiAccessToken({
        registration: platform.registration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.lineItem],
        advertisedScopes: [LTI_SCOPES.lineItem],
      })
    ).rejects.toThrow('exceeded');
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
        grant: token,
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
      grant: token,
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
      grant: token,
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
      grant: token,
      registration: platform.registration,
      lineItem: {
        scoreMaximum: 100,
        label: 'Yawp Network Contract',
        resourceId: 'resource-network-contract-001',
        tag: 'yawp-contract',
        startDateTime: '2026-08-01T09:00:00-05:00',
        endDateTime: null,
        gradesReleased: false,
        'https://provider.example/extension': { retained: true },
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
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl: lineItem.id,
        grant: token,
        registration: platform.registration,
      })
    ).toEqual(lineItem);
    const updated = await updateAgsLineItem({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      lineItemUrl: lineItem.id,
      grant: token,
      registration: platform.registration,
      lineItem: { ...lineItem, label: 'Yawp Network Contract Updated' },
    });
    expect(updated).toMatchObject({
      id: lineItem.id,
      label: 'Yawp Network Contract Updated',
      startDateTime: '2026-08-01T09:00:00-05:00',
      endDateTime: null,
      gradesReleased: false,
      'https://provider.example/extension': { retained: true },
    });
    await submitAgsScore({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      lineItemUrl: lineItem.id,
      grant: token,
      registration: platform.registration,
      score,
    });
    await submitAgsScore({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      lineItemUrl: lineItem.id,
      grant: token,
      registration: platform.registration,
      score: { ...score, timestamp: '2026-07-21T12:00:00.001Z' },
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

  test('lists and filters line items with read-only scope and blocks writes', async () => {
    const platform = await startPlatform();
    const writeAssertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-lineitem-list-write',
      nowSeconds: platform.seed.nowSeconds,
    });
    const writeToken = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: writeAssertion,
      scopes: [LTI_SCOPES.lineItem],
      advertisedScopes: [LTI_SCOPES.lineItem],
    });
    await createAgsLineItem({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      grant: writeToken,
      registration: platform.registration,
      lineItem: {
        scoreMaximum: 20,
        label: 'Second item',
        resourceId: 'resource-second',
        resourceLinkId: 'resource-link-second',
        tag: 'second-tag',
      },
    });

    const readAssertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-lineitem-list-read',
      nowSeconds: platform.seed.nowSeconds,
    });
    const readToken = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: readAssertion,
      scopes: [LTI_SCOPES.lineItemReadonly],
      advertisedScopes: [LTI_SCOPES.lineItemReadonly],
    });
    const all = await fetchAllAgsLineItems({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      grant: readToken,
      registration: platform.registration,
      filters: { limit: 1 },
    });
    expect(all).toHaveLength(2);
    const filtered = await fetchAllAgsLineItems({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      grant: readToken,
      registration: platform.registration,
      filters: {
        resourceLinkId: 'resource-link-second',
        resourceId: 'resource-second',
        tag: 'second-tag',
      },
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.label).toBe('Second item');
    expect(
      await getAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl: filtered[0]!.id,
        grant: readToken,
        registration: platform.registration,
      })
    ).toEqual(filtered[0]);
    await expect(
      updateAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl: filtered[0]!.id,
        grant: readToken,
        registration: platform.registration,
        lineItem: { ...filtered[0]!, label: 'Forbidden update' },
      })
    ).rejects.toThrow('required scope');
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
        grant: token,
        registration: platform.registration,
        lineItem: { scoreMaximum: 100, label: 'Expected media type' },
      })
    ).rejects.toThrow('media type');
  });

  test('round-trips provider line-item responses with blank and null optionals', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-provider-empty-lineitem-fields',
      nowSeconds: platform.seed.nowSeconds,
    });
    const grant = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.lineItemReadonly],
      advertisedScopes: [LTI_SCOPES.lineItemReadonly],
    });
    const lineItemUrl = `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`;
    platform.failNext('ags', {
      status: 200,
      contentType: LTI_AGS_LINE_ITEM_MEDIA_TYPE,
      body: JSON.stringify({
        id: lineItemUrl,
        scoreMaximum: 100,
        label: 'Provider empty fields',
        resourceId: '',
        resourceLinkId: null,
        tag: null,
        startDateTime: '',
        endDateTime: null,
        gradesReleased: null,
      }),
    });

    await expect(
      getAgsLineItem({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl,
        grant,
        registration: platform.registration,
      })
    ).resolves.toMatchObject({
      resourceId: '',
      resourceLinkId: null,
      tag: null,
      startDateTime: '',
      endDateTime: null,
    });
  });

  test('supports progress-only and clear scores, query-bearing IDs, and rejects negatives', async () => {
    const platform = await startPlatform();
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
    const beforeNegativeScore = platform.journal.length;
    await expect(
      submitAgsScore({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl: `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`,
        grant: token,
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
    expect(platform.journal).toHaveLength(beforeNegativeScore);

    const beforeInvalidTimestamp = platform.journal.length;
    await expect(
      submitAgsScore({
        lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
        lineItemUrl: `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`,
        grant: token,
        registration: platform.registration,
        score: {
          userId: 'lti-learner-ada',
          activityProgress: 'InProgress',
          gradingProgress: 'Pending',
          timestamp: '2026-07-21T12:00:00Z',
        },
      })
    ).rejects.toThrow('sub-second');
    expect(platform.journal).toHaveLength(beforeInvalidTimestamp);
    await submitAgsScore({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      lineItemUrl: `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`,
      grant: token,
      registration: platform.registration,
      score: {
        userId: 'lti-learner-ada',
        activityProgress: 'InProgress',
        gradingProgress: 'Pending',
        timestamp: '2026-07-21T12:00:00.000+00',
      },
    });
    expect(platform.state.scores.at(-1)).toMatchObject({
      userId: 'lti-learner-ada',
      activityProgress: 'InProgress',
    });

    platform.state.lineItems.set('lineitem-query-001', {
      id: `${platform.baseUrl}/lineitems/lineitem-query-001?tenant=ua`,
      scoreMaximum: 100,
      label: 'Query-bound item',
      resourceLinkId: 'resource-query-001',
    });
    await submitAgsScore({
      lineItemsUrl: `${platform.baseUrl}/contexts/course-eng-101/lineitems`,
      lineItemUrl: `${platform.baseUrl}/lineitems/lineitem-query-001?tenant=ua`,
      grant: token,
      registration: platform.registration,
      score: {
        userId: 'lti-learner-ada',
        scoreGiven: null,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: '2026-07-21T07:00:00.000-05:00',
        scoringUserId: 'lti-instructor-kevin',
        comment: null,
        submission: { submittedAt: '2026-07-21T06:30:00.000-05:00' },
      },
    });
    expect(platform.state.scores.at(-1)).toMatchObject({
      scoreGiven: null,
      scoringUserId: 'lti-instructor-kevin',
    });
    expect(platform.journal.at(-1)).toMatchObject({
      path: '/lineitems/lineitem-query-001/scores',
      queryKeys: ['tenant'],
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
        grant: token,
        registration: {
          ...platform.registration,
          allowedServiceOrigins: [platform.baseUrl, capture.baseUrl],
        },
        lineItem: { scoreMaximum: 100, label: 'Expected item' },
      })
    ).rejects.toThrow('origin');
    expect(capture.requests).toHaveLength(0);
  });

  test('rejects a client assertion bound to another registration before disclosure', async () => {
    const platform = await startPlatform();
    const capture = await startMockHttpCaptureServer();
    captureServers.push(capture);
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-wrong-registration',
      nowSeconds: platform.seed.nowSeconds,
    });
    const otherRegistration = {
      ...platform.alternateRegistration,
      tokenEndpoint: `${capture.baseUrl}/oauth2/token`,
      allowedServiceOrigins: [capture.baseUrl],
    };

    await expect(
      requestLtiAccessToken({
        registration: otherRegistration,
        clientAssertion: assertion,
        scopes: [LTI_SCOPES.lineItem],
        advertisedScopes: [LTI_SCOPES.lineItem],
      })
    ).rejects.toThrow('bound');
    expect(capture.requests).toHaveLength(0);
  });

  test('binds service grants to one registration, organization, and deployment', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.alternateRegistration.clientId,
      tokenEndpoint: platform.alternateRegistration.tokenEndpoint,
      deploymentId: platform.alternateRegistration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-alternate-registration-service',
      nowSeconds: platform.seed.nowSeconds,
    });
    const alternateGrant = await requestLtiAccessToken({
      registration: platform.alternateRegistration,
      clientAssertion: assertion,
      scopes: [LTI_SCOPES.contextMembershipReadonly],
      advertisedScopes: [LTI_SCOPES.contextMembershipReadonly],
    });

    const before = platform.journal.length;
    await expect(
      fetchAllNrpsMemberships({
        membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
        grant: alternateGrant,
        registration: platform.registration,
        expectedContextId: 'course-eng-101',
      })
    ).rejects.toThrow('bound');
    expect(platform.journal).toHaveLength(before);

    const direct = await networkFetch(
      `${platform.baseUrl}/contexts/course-eng-101/memberships`,
      {
        headers: {
          accept: LTI_NRPS_MEDIA_TYPE,
          authorization: `Bearer ${alternateGrant.accessToken}`,
        },
      }
    );
    expect(direct.status).toBe(401);
  });

  test('expires provider grants and stops all service traffic after disablement', async () => {
    const platform = await startPlatform();
    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'client-assertion-expiry-disable',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: [
        LTI_SCOPES.contextMembershipReadonly,
        LTI_SCOPES.lineItem,
        LTI_SCOPES.score,
      ],
      advertisedScopes: [
        LTI_SCOPES.contextMembershipReadonly,
        LTI_SCOPES.lineItem,
        LTI_SCOPES.score,
      ],
    });
    platform.advanceTime(301);
    const expired = await networkFetch(
      `${platform.baseUrl}/contexts/course-eng-101/memberships`,
      {
        headers: {
          accept: LTI_NRPS_MEDIA_TYPE,
          authorization: `Bearer ${token.accessToken}`,
        },
      }
    );
    expect(expired.status).toBe(401);

    platform.journal.splice(0);
    const registration = { ...platform.registration, enabled: false };
    const lineItemsUrl = `${platform.baseUrl}/contexts/course-eng-101/lineitems`;
    const lineItemUrl = `${platform.baseUrl}/lineitems/lineitem-argument-essay-001`;
    const attempts = await Promise.allSettled([
      fetchAllNrpsMemberships({
        membershipsUrl: `${platform.baseUrl}/contexts/course-eng-101/memberships`,
        grant: token,
        registration,
        expectedContextId: 'course-eng-101',
      }),
      fetchAllAgsLineItems({
        lineItemsUrl,
        grant: token,
        registration,
      }),
      createAgsLineItem({
        lineItemsUrl,
        grant: token,
        registration,
        lineItem: { scoreMaximum: 100, label: 'Disabled create' },
      }),
      getAgsLineItem({
        lineItemsUrl,
        lineItemUrl,
        grant: token,
        registration,
      }),
      updateAgsLineItem({
        lineItemsUrl,
        lineItemUrl,
        grant: token,
        registration,
        lineItem: {
          id: lineItemUrl,
          scoreMaximum: 100,
          label: 'Disabled update',
        },
      }),
      submitAgsScore({
        lineItemsUrl,
        lineItemUrl,
        grant: token,
        registration,
        score: {
          userId: 'lti-learner-ada',
          activityProgress: 'InProgress',
          gradingProgress: 'Pending',
          timestamp: '2026-07-21T12:00:00.000Z',
        },
      }),
    ]);
    expect(attempts.every((attempt) => attempt.status === 'rejected')).toBe(
      true
    );
    expect(platform.journal).toHaveLength(0);
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
        grant: token,
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
