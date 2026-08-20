import { randomUUID } from 'node:crypto';

const DEFAULT_CLIENT_ID = 'yawp-blackboard-mock';
const DEFAULT_DEPLOYMENT_ID = 'yawp-mock-deployment';
const DEFAULT_ISSUER = 'https://blackboard.com';

export const AGS_SCOPES = {
  lineitem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineitemReadonly: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  resultReadonly: 'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
};

export const NRPS_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';

export const ALL_SERVICE_SCOPES = [
  AGS_SCOPES.lineitem,
  AGS_SCOPES.lineitemReadonly,
  AGS_SCOPES.score,
  AGS_SCOPES.resultReadonly,
  NRPS_SCOPE,
];

export const FAULTS = [
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
];

export function resolveMockConfig(overrides = {}) {
  const env = overrides.env || process.env;
  const issuer = overrides.issuer || env.BLACKBOARD_LTI_MOCK_ISSUER || DEFAULT_ISSUER;
  const clientId =
    overrides.clientId || env.BLACKBOARD_LTI_MOCK_CLIENT_ID || DEFAULT_CLIENT_ID;
  const deploymentId =
    overrides.deploymentId ||
    env.BLACKBOARD_LTI_MOCK_DEPLOYMENT_ID ||
    DEFAULT_DEPLOYMENT_ID;
  const publicUrl = (
    overrides.publicUrl ||
    env.BLACKBOARD_LTI_MOCK_PUBLIC_URL ||
    ''
  ).replace(/\/$/, '');
  const publicBasePath = String(
    overrides.publicBasePath ?? env.BLACKBOARD_LTI_MOCK_PUBLIC_BASE_PATH ?? ''
  ).replace(/\/$/, '');
  return {
    env,
    issuer,
    clientId,
    deploymentId,
    platformGuid:
      overrides.platformGuid ||
      env.BLACKBOARD_LTI_MOCK_PLATFORM_GUID ||
      'yawp-blackboard-mock-guid',
    toolRedirectUri:
      overrides.toolRedirectUri ||
      env.BLACKBOARD_LTI_MOCK_TOOL_REDIRECT_URI ||
      'http://127.0.0.1:5176/lti/launch',
    toolOidcLoginUrl:
      overrides.toolOidcLoginUrl ||
      env.BLACKBOARD_LTI_MOCK_TOOL_OIDC_LOGIN_URL ||
      'http://127.0.0.1:5176/lti/login',
    toolJwksUrl:
      overrides.toolJwksUrl || env.BLACKBOARD_LTI_MOCK_TOOL_JWKS_URL || '',
    toolPublicJwk: overrides.toolPublicJwk || parseJsonEnv(env.BLACKBOARD_LTI_MOCK_TOOL_JWK),
    tokenTtlSeconds: Number(
      overrides.tokenTtlSeconds ?? env.BLACKBOARD_LTI_MOCK_TOKEN_TTL_SECONDS ?? 60
    ),
    timeoutDelayMs: Number(
      overrides.timeoutDelayMs ?? env.BLACKBOARD_LTI_MOCK_TIMEOUT_MS ?? 35_000
    ),
    publicUrl,
    publicBasePath,
    now: overrides.now || (() => Date.now()),
  };
}

function parseJsonEnv(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function createStore() {
  return {
    events: [],
    issuedNonces: [],
    launchHints: new Map(),
    lineItems: new Map(),
    scoresReceived: [],
    scoresCurrent: new Map(),
    deepLinks: [],
    accessTokens: new Map(),
    defaultLineItemIdByContext: new Map(),
  };
}

export function recordEvent(store, event) {
  store.events.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    ...event,
  });
  if (store.events.length > 500) store.events.splice(0, store.events.length - 500);
}

export function scoreKey(lineItemId, userId) {
  return `${lineItemId}::${userId}`;
}
