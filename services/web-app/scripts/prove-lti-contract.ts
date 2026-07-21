import {
  LTI_MESSAGE_TYPES,
  createDeepLinkingResponseJwt,
  createLtiClientAssertion,
  requestLtiAccessToken,
  verifyLtiLaunchForm,
} from '../app/domain/lms/lti-contract.server';
import {
  LTI_SCOPES,
  createAgsLineItem,
  fetchAllNrpsMemberships,
  submitAgsScore,
} from '../app/domain/lms/lti-services.server';
import {
  type MockLtiPlatform,
  startMockLtiPlatform,
} from '../e2e/mocks/lti/mock-lti-platform';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function extractFormPost(html: string) {
  const fields = Object.fromEntries(
    [...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [
      match[1],
      match[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    ])
  );
  invariant(fields.id_token, 'OIDC form_post did not contain id_token.');
  invariant(fields.state, 'OIDC form_post did not contain state.');
  return { idToken: fields.id_token, state: fields.state };
}

async function authorize(
  platform: MockLtiPlatform,
  messageHint: string,
  state: string,
  nonce: string
) {
  const url = new URL(platform.registration.authorizationEndpoint);
  url.search = new URLSearchParams({
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: platform.registration.clientId,
    redirect_uri: platform.registration.targetLinkUri,
    login_hint: 'login-kevin',
    lti_message_hint: messageHint,
    state,
    nonce,
  }).toString();
  const response = await fetch(url);
  invariant(response.ok, `OIDC authorization returned ${response.status}.`);
  return extractFormPost(await response.text());
}

async function run() {
  const platform = await startMockLtiPlatform();
  try {
    const resourceForm = await authorize(
      platform,
      'instructor-resource-link',
      'proof-state-resource',
      'proof-nonce-resource'
    );
    const resourceLaunch = await verifyLtiLaunchForm(resourceForm, {
      registration: platform.registration,
      expectedState: 'proof-state-resource',
      expectedNonce: 'proof-nonce-resource',
      expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
      nowSeconds: platform.seed.nowSeconds,
    });

    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'proof-client-assertion-001',
      nowSeconds: platform.seed.nowSeconds,
    });
    const token = await requestLtiAccessToken({
      tokenEndpoint: platform.registration.tokenEndpoint,
      clientAssertion: assertion,
      scopes: [
        LTI_SCOPES.contextMembershipReadonly,
        LTI_SCOPES.lineItem,
        LTI_SCOPES.score,
      ],
    });
    const roster = await fetchAllNrpsMemberships({
      membershipsUrl: `${resourceLaunch.services.membershipsUrl}?limit=2`,
      accessToken: token.accessToken,
    });
    invariant(roster.members.length === 4, 'NRPS roster size drifted.');

    const lineItem = await createAgsLineItem({
      lineItemsUrl: resourceLaunch.services.lineItemsUrl!,
      accessToken: token.accessToken,
      lineItem: {
        scoreMaximum: 100,
        label: 'Yawp LMS Contract Proof',
        resourceId: 'resource-proof-001',
        tag: 'yawp-proof',
      },
    });
    const score = {
      userId: 'lti-learner-ada',
      scoreGiven: 94,
      scoreMaximum: 100,
      activityProgress: 'Completed' as const,
      gradingProgress: 'FullyGraded' as const,
      timestamp: '2026-07-21T12:00:00.000Z',
    };
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await submitAgsScore({
        lineItemUrl: lineItem.id,
        accessToken: token.accessToken,
        idempotencyKey: 'proof-grade-release-ada-001',
        score,
      });
    }
    invariant(platform.state.scores.size === 1, 'AGS idempotency drifted.');

    const deepLinkForm = await authorize(
      platform,
      'deep-link',
      'proof-state-deep-link',
      'proof-nonce-deep-link'
    );
    const deepLinkLaunch = await verifyLtiLaunchForm(deepLinkForm, {
      registration: platform.registration,
      expectedState: 'proof-state-deep-link',
      expectedNonce: 'proof-nonce-deep-link',
      expectedMessageType: LTI_MESSAGE_TYPES.deepLinkingRequest,
      nowSeconds: platform.seed.nowSeconds,
    });
    invariant(
      deepLinkLaunch.deepLinking,
      'Deep Linking settings were missing.'
    );
    const deepLinkResponse = createDeepLinkingResponseJwt({
      clientId: platform.registration.clientId,
      platformIssuer: platform.registration.issuer,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      data: deepLinkLaunch.deepLinking.data,
      contentItems: [platform.seed.contentItem],
      nowSeconds: platform.seed.nowSeconds,
    });
    const returnResponse = await fetch(deepLinkLaunch.deepLinking.returnUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ JWT: deepLinkResponse }),
    });
    invariant(
      returnResponse.status === 204,
      `Deep Linking return produced ${returnResponse.status}.`
    );

    const journalJson = JSON.stringify(platform.journal);
    invariant(
      !journalJson.includes(assertion),
      'Journal leaked client assertion.'
    );
    invariant(
      !journalJson.includes(token.accessToken),
      'Journal leaked bearer token.'
    );
    invariant(
      !journalJson.includes(platform.tool.privateKeyPem),
      'Journal leaked private key.'
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          providerProfile: 'blackboard-reference',
          transport: 'real-loopback-http',
          launch: {
            issuer: resourceLaunch.issuer,
            deploymentId: resourceLaunch.deploymentId,
            contextId: resourceLaunch.context.id,
            resourceLinkId: resourceLaunch.resourceLink?.id,
            role: resourceLaunch.roles[0],
          },
          advantage: {
            rosterMembers: roster.members.length,
            rosterPages: platform.journal.filter((entry) =>
              entry.path.endsWith('/memberships')
            ).length,
            lineItemCreated: lineItem.id,
            scoreWritesReceived: platform.journal.filter((entry) =>
              entry.path.endsWith('/scores')
            ).length,
            scoreRecordsStored: platform.state.scores.size,
            deepLinkItemsReturned: platform.state.deepLinkContentItems.length,
          },
          security: {
            rs256: true,
            jwksFetchedOverNetwork: platform.journal.some(
              (entry) => entry.path === '/.well-known/jwks.json'
            ),
            secretsRedacted: true,
          },
          requestPaths: platform.journal.map(
            (entry) => `${entry.method} ${entry.path}`
          ),
        },
        null,
        2
      )}\n`
    );
  } finally {
    await platform.close();
  }
}

await run();
