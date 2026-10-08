import { createSign, KeyObject, generateKeyPairSync } from 'node:crypto';

type LtiAgsEndpointClaim = {
  scope: string[];
  lineitems: string;
  lineitem?: string;
};

type LtiLaunchClaims = {
  iss: string;
  sub: string; // Blackboard user id
  'https://purl.imsglobal.org/spec/lti/claim/context'?: { id: string };
  'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'?: LtiAgsEndpointClaim;
};

let latestLaunchClaims: LtiLaunchClaims | null = null;
export function recordLtiLaunchClaims(claims: LtiLaunchClaims) {
  latestLaunchClaims = claims;
}
export function getLatestLtiLaunchClaims() {
  return latestLaunchClaims;
}

type PostScoreInput = {
  lineItemUrl: string;
  userId: string;
  scoreGiven: number;
  scoreMaximum: number;
  activityProgress?: 'Initialized' | 'InProgress' | 'Completed';
  gradingProgress?: 'NotReady' | 'Pending' | 'PendingManual' | 'Failed' | 'FullyGraded';
  timestamp?: string; // ISO
  // OAuth / client assertion inputs
  tokenEndpoint: string;
  clientId: string;
  extraScopes?: string[]; // e.g. lineitem for future flows
};

// In-memory dev-only cache of the most recent mock launch
let cachedMockLaunch: {
  fetchedAt: number;
  origin: string;
  claims: LtiLaunchClaims;
} | null = null;

// In-memory Tool keypair (dev/preview). Stable for process lifetime.
let toolPrivateKeyPemCache: string | null = null;
type PublicJwkSig = {
  kty: 'RSA';
  alg: 'RS256';
  use: 'sig';
  kid?: string;
  n?: string;
  e?: string;
};
let toolPublicJwkCache: PublicJwkSig | null = null;
let toolKidCache: string | null = null;

function ensureToolKeypair() {
  if (toolPrivateKeyPemCache && toolPublicJwkCache && toolKidCache) return;
  const envPem = String(process.env.LTI_TOOL_PRIVATE_KEY_PEM || '').trim();
  if (envPem) {
    // Best effort: reconstruct the public JWK via a throwaway public export.
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const tmpPublicJwk = pair.publicKey.export({ format: 'jwk' }) as any;
    toolPrivateKeyPemCache = envPem;
    toolPublicJwkCache = {
      ...tmpPublicJwk,
      // Leave n/e from generated; the mock only needs kid + RSA alg/use typing
      // when a JWKS URL is configured but a PEM is supplied locally.
      kty: 'RSA',
      alg: 'RS256',
      use: 'sig',
    };
    toolKidCache = (toolPublicJwkCache && toolPublicJwkCache.kid) ? toolPublicJwkCache.kid : 'yawp-tool-key';
    return;
  }
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const publicJwk = publicKey.export({ format: 'jwk' }) as any;
  publicJwk.alg = 'RS256';
  publicJwk.use = 'sig';
  publicJwk.kid = publicJwk.kid || `yawp-${Math.random().toString(16).slice(2)}`;
  toolPrivateKeyPemCache = privateKey.export({ format: 'pem', type: 'pkcs1' }).toString();
  toolPublicJwkCache = publicJwk;
  toolKidCache = publicJwk.kid;
}

export function getToolJwks() {
  ensureToolKeypair();
  return { keys: [toolPublicJwkCache!] };
}

function getToolPrivateKeyPem() {
  ensureToolKeypair();
  return toolPrivateKeyPemCache!;
}

function getToolKid() {
  ensureToolKeypair();
  return toolKidCache!;
}

export function signToolJwt(payload: Record<string, unknown>) {
  const header = { alg: 'RS256' as const, typ: 'JWT' as const, kid: getToolKid() };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(getToolPrivateKeyPem());
  return `${signingInput}.${b64url(signature)}`;
}

function b64url(input: Buffer | string) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}

async function clientCredentialsJwt({
  tokenEndpoint,
  clientId,
  privateKeyPem,
  kid,
  ttlSeconds = 300,
}: {
  tokenEndpoint: string;
  clientId: string;
  privateKeyPem: string;
  kid?: string;
  ttlSeconds?: number;
}) {
  const iat = nowEpochSeconds();
  const header = { alg: 'RS256' as const, typ: 'JWT' as const, ...(kid ? { kid } : {}) };
  const payload = {
    iss: clientId,
    sub: clientId,
    aud: tokenEndpoint,
    iat,
    exp: iat + ttlSeconds,
    jti: `${iat}-${Math.random().toString(16).slice(2)}`,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKeyPem);
  return `${signingInput}.${b64url(signature)}`;
}

async function mintAgsBearerToken(input: {
  tokenEndpoint: string;
  clientId: string;
  scope: string[];
  kid?: string;
}) {
  const privateKeyPem = getToolPrivateKeyPem();
  const assertion = await clientCredentialsJwt({
    tokenEndpoint: input.tokenEndpoint,
    clientId: input.clientId,
    privateKeyPem,
    kid: input.kid ?? getToolKid(),
  });

  const response = await fetch(input.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: input.scope.join(' '),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AGS token endpoint error ${response.status}: ${text}`);
  }
  const json = (await response.json()) as { access_token: string; expires_in?: number; scope?: string };
  if (!json.access_token) throw new Error('AGS token endpoint did not return access_token');
  return json.access_token;
}

export async function postScoreToAgs({
  lineItemUrl,
  userId,
  scoreGiven,
  scoreMaximum,
  activityProgress = 'Completed',
  gradingProgress = 'FullyGraded',
  timestamp = new Date().toISOString(),
  tokenEndpoint,
  clientId,
  extraScopes = [],
}: PostScoreInput) {
  const token = await mintAgsBearerToken({
    tokenEndpoint,
    clientId,
    scope: [
      'https://purl.imsglobal.org/spec/lti-ags/scope/score',
      ...extraScopes,
    ],
  });
  const score = {
    userId,
    timestamp,
    scoreGiven,
    scoreMaximum,
    activityProgress,
    gradingProgress,
  };
  const response = await fetch(lineItemUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/vnd.ims.lis.v1.score+json',
    },
    body: JSON.stringify(score),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AGS score post failed ${response.status}: ${text}`);
  }
}

/**
 * Dev-only helper: fetch a Blackboard-mock id_token with claims (context id, AGS endpoint URLs).
 * Uses the mock's /dev/launch?format=json flow — no OIDC roundtrip needed.
 */
export async function ensureMockLaunchClaims() {
  if (latestLaunchClaims) return latestLaunchClaims;
  const origin = String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(/\/$/, '');
  if (!origin) return null;
  const cacheTtlMs = 60_000;
  if (cachedMockLaunch && cachedMockLaunch.origin === origin && Date.now() - cachedMockLaunch.fetchedAt < cacheTtlMs) {
    return cachedMockLaunch.claims;
  }
  const url = `${origin}/dev/launch?format=json&role=student&resource_link_id=_99_1`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return null;
  const body = (await res.json()) as { id_token: string };
  if (!body?.id_token) return null;
  const [_, payloadB64] = body.id_token.split('.');
  const claims = JSON.parse(Buffer.from(payloadB64, 'base64').toString('utf8')) as LtiLaunchClaims;
  cachedMockLaunch = { origin, fetchedAt: Date.now(), claims };
  return claims;
}

/**
 * The same passback for callers that do not wait on it, such as releasing
 * grades. Any failure is logged here: a rejection left unhandled terminates
 * the Node process, and a passback is never worth the server.
 */
export async function postGradeToBlackboardInBackground(
  input: Parameters<typeof maybePostGradeToBlackboard>[0]
): Promise<void> {
  try {
    await maybePostGradeToBlackboard(input);
  } catch (error) {
    console.warn('Blackboard AGS passback failed', { error });
  }
}

/**
 * Convenience for server routes: if mock env is present and a numeric grade exists,
 * post it to the mock AGS lineitem for the test resource link.
 *
 * Strictly dev-only: reads BLACKBOARD_LTI_MOCK_URL, LTI_TOOL_PRIVATE_KEY_PEM, LTI_CLIENT_ID.
 */
export async function maybePostGradeToBlackboard({
  numericPercentage,
  studentMockUserId,
}: {
  numericPercentage: number | null;
  studentMockUserId?: string; // Optional override; defaults to launch sub
}) {
  if (numericPercentage == null) return;
  // Use the latest real launch claims first (from POST /lti/launch)
  let claims = getLatestLtiLaunchClaims();
  if (!claims) {
    claims = await ensureMockLaunchClaims();
  }
  if (!claims) return;

  const ags = claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'];
  const contextId =
    claims['https://purl.imsglobal.org/spec/lti/claim/context']?.id || '_4_1';
  const clientId = String(process.env.LTI_CLIENT_ID || 'yawp-blackboard-mock');

  // Derive origin and line item from the actual launch claims when available
  const derivedOrigin =
    (ags?.lineitems && safeOrigin(ags.lineitems)) ||
    (ags?.lineitem && safeOrigin(ags.lineitem)) ||
    String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(/\/$/, '');
  if (!derivedOrigin) return;

  // Build URLs relative to the internal mock upstream when available,
  // else route through our same-origin proxy at /dev/blackboard-lti-mock.
  const mockInternal = String(process.env.BLACKBOARD_LTI_MOCK_URL || '').replace(/\/$/, '');
  const toMockUrl = (path: string) => {
    if (mockInternal) return `${mockInternal}${path}`;
    // same-origin proxy
    const proxyBase = `${derivedOrigin}/dev/blackboard-lti-mock`;
    return `${proxyBase}${path}`;
  };
  // Prefer the Resource Link ID from the actual launch to pick the correct line item
  const resourceLinkId =
    (claims as any)['https://purl.imsglobal.org/spec/lti/claim/resource_link']?.id || '';
  const derivedLineItemId = resourceLinkId
    ? `_${String(resourceLinkId).replace(/^_/, '')}_grade`
    : (ags?.lineitem?.split('/').pop() || '_99_1_grade');
  const lineItemPath =
    ags?.lineitem && isUrl(ags.lineitem) && !resourceLinkId
      ? new URL(ags.lineitem).pathname.replace(/\/$/, '') + '/scores'
      : `/learn/api/v1/lti/courses/${encodeURIComponent(
          contextId
        )}/lineItems/${encodeURIComponent(derivedLineItemId)}/scores`;
  const lineItemUrl = toMockUrl(lineItemPath);
  const tokenEndpoint = toMockUrl('/api/v1/gateway/oauth2/jwttoken');
  const userId = studentMockUserId || claims.sub || 'bb-user-student';

  await postScoreToAgs({
    lineItemUrl,
    userId,
    scoreGiven: numericPercentage,
    scoreMaximum: 100,
    tokenEndpoint,
    clientId,
  });
}

function safeOrigin(url: string | undefined) {
  try {
    return url ? new URL(url).origin : '';
  } catch {
    return '';
  }
}
function isUrl(url: string | undefined) {
  try {
    return Boolean(url && new URL(url));
  } catch {
    return false;
  }
}

