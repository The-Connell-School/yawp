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
  getAgsLineItem,
  submitAgsScore,
  updateAgsLineItem,
} from '../app/domain/lms/lti-services.server';
import {
  type MockLtiPlatform,
  startMockLtiPlatform,
} from '../e2e/mocks/lti/mock-lti-platform';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function extractFormPost(html: string) {
  const action = html.match(/<form[^>]+action="([^"]+)"/)?.[1];
  const fields = Object.fromEntries(
    [...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map((match) => [
      match[1],
      match[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&'),
    ])
  );
  invariant(action, 'OIDC form_post did not contain a form action.');
  invariant(fields.id_token, 'OIDC form_post did not contain id_token.');
  invariant(fields.state, 'OIDC form_post did not contain state.');
  return { action, idToken: fields.id_token, state: fields.state };
}

async function authorize(
  platform: MockLtiPlatform,
  messageHint: string,
  state: string,
  nonce: string,
  targetLinkUri: string
) {
  const url = new URL(platform.registration.authorizationEndpoint);
  url.search = new URLSearchParams({
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: platform.registration.clientId,
    redirect_uri: targetLinkUri,
    login_hint: 'login-kevin',
    lti_message_hint: messageHint,
    state,
    nonce,
  }).toString();
  const response = await Bun.fetch(url);
  invariant(response.ok, `OIDC authorization returned ${response.status}.`);
  const form = extractFormPost(await response.text());
  const callback = await Bun.fetch(form.action, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      id_token: form.idToken,
      state: form.state,
    }),
  });
  invariant(
    callback.ok,
    `OIDC form_post callback returned ${callback.status}.`
  );
  return (await callback.json()) as { idToken: string; state: string };
}

async function run() {
  const platform = await startMockLtiPlatform();
  try {
    const resourceForm = await authorize(
      platform,
      'instructor-resource-link',
      'proof-state-resource',
      'proof-nonce-resource',
      platform.registration.launchUrl
    );
    const resourceLaunch = await verifyLtiLaunchForm(resourceForm, {
      registration: platform.registration,
      expectedState: 'proof-state-resource',
      expectedNonce: 'proof-nonce-resource',
      expectedTargetLinkUri: platform.registration.launchUrl,
      expectedMessageType: LTI_MESSAGE_TYPES.resourceLinkRequest,
      nowSeconds: platform.seed.nowSeconds,
      fetchImpl: Bun.fetch as unknown as typeof fetch,
    });

    const assertion = createLtiClientAssertion({
      clientId: platform.registration.clientId,
      tokenEndpoint: platform.registration.tokenEndpoint,
      deploymentId: platform.registration.deploymentId,
      privateKeyPem: platform.tool.privateKeyPem,
      keyId: platform.tool.keyId,
      jti: 'proof-client-assertion-001',
      nowSeconds: platform.seed.nowSeconds,
    });
    const requestedScopes = [
      LTI_SCOPES.contextMembershipReadonly,
      LTI_SCOPES.lineItem,
      LTI_SCOPES.score,
    ];
    const token = await requestLtiAccessToken({
      registration: platform.registration,
      clientAssertion: assertion,
      scopes: requestedScopes,
      advertisedScopes: [
        LTI_SCOPES.contextMembershipReadonly,
        ...resourceLaunch.services.agsScopes,
      ],
      fetchImpl: Bun.fetch as unknown as typeof fetch,
    });
    invariant(
      resourceLaunch.services.membershipsUrl,
      'Launch did not advertise an NRPS endpoint.'
    );
    const roster = await fetchAllNrpsMemberships({
      membershipsUrl: `${resourceLaunch.services.membershipsUrl}?limit=2`,
      accessToken: token.accessToken,
      registration: platform.registration,
      expectedContextId: resourceLaunch.context.id,
      fetchImpl: Bun.fetch as unknown as typeof fetch,
    });
    invariant(roster.members.length === 4, 'NRPS roster size drifted.');
    invariant(
      resourceLaunch.services.lineItemsUrl,
      'Launch did not advertise an AGS line-items endpoint.'
    );
    const lineItem = await createAgsLineItem({
      lineItemsUrl: resourceLaunch.services.lineItemsUrl,
      accessToken: token.accessToken,
      registration: platform.registration,
      fetchImpl: Bun.fetch as unknown as typeof fetch,
      lineItem: {
        scoreMaximum: 100,
        label: 'Yawp LMS Contract Proof',
        resourceId: 'resource-proof-001',
        resourceLinkId: resourceLaunch.resourceLink?.id,
        tag: 'yawp-proof',
      },
    });
    const readLineItem = await getAgsLineItem({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      registration: platform.registration,
      fetchImpl: Bun.fetch as unknown as typeof fetch,
    });
    const updatedLineItem = await updateAgsLineItem({
      lineItemUrl: lineItem.id,
      accessToken: token.accessToken,
      registration: platform.registration,
      fetchImpl: Bun.fetch as unknown as typeof fetch,
      lineItem: { ...readLineItem, label: 'Yawp LMS Contract Proof Updated' },
    });
    invariant(
      updatedLineItem.label.endsWith('Updated'),
      'AGS line-item update drifted.'
    );
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
        registration: platform.registration,
        score,
        fetchImpl: Bun.fetch as unknown as typeof fetch,
      });
    }
    invariant(
      platform.state.scores.length === 2,
      'Provider did not receive both grade writes.'
    );

    const deepLinkForm = await authorize(
      platform,
      'deep-link',
      'proof-state-deep-link',
      'proof-nonce-deep-link',
      platform.registration.deepLinkingLaunchUrl
    );
    const deepLinkLaunch = await verifyLtiLaunchForm(deepLinkForm, {
      registration: platform.registration,
      expectedState: 'proof-state-deep-link',
      expectedNonce: 'proof-nonce-deep-link',
      expectedTargetLinkUri: platform.registration.deepLinkingLaunchUrl,
      expectedMessageType: LTI_MESSAGE_TYPES.deepLinkingRequest,
      nowSeconds: platform.seed.nowSeconds,
      fetchImpl: Bun.fetch as unknown as typeof fetch,
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
    const returnResponse = await Bun.fetch(
      deepLinkLaunch.deepLinking.returnUrl,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ JWT: deepLinkResponse }),
      }
    );
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
            formPostCallbacks: platform.tool.launchRequests.map((request) => ({
              method: 'POST',
              path: request.path,
              contentType: request.contentType,
            })),
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
            lineItemReadAndUpdated: true,
            scoreWritesReceived: platform.journal.filter((entry) =>
              entry.path.endsWith('/scores')
            ).length,
            scoreRecordsStored: platform.state.scores.length,
            idempotencyOwner: 'yawp-grade-job-issue-213',
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
