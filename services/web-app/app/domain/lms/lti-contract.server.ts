import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomUUID,
  type JsonWebKey,
} from 'node:crypto';
import { z } from 'zod';
import {
  assertAllowedLtiServiceUrl,
  LtiNetworkUrlSchema,
  type LtiRegistration,
} from './lti-registration';

export const LTI_CLAIMS = {
  messageType: 'https://purl.imsglobal.org/spec/lti/claim/message_type',
  version: 'https://purl.imsglobal.org/spec/lti/claim/version',
  deploymentId: 'https://purl.imsglobal.org/spec/lti/claim/deployment_id',
  targetLinkUri: 'https://purl.imsglobal.org/spec/lti/claim/target_link_uri',
  roles: 'https://purl.imsglobal.org/spec/lti/claim/roles',
  context: 'https://purl.imsglobal.org/spec/lti/claim/context',
  resourceLink: 'https://purl.imsglobal.org/spec/lti/claim/resource_link',
  custom: 'https://purl.imsglobal.org/spec/lti/claim/custom',
  namesRoleService:
    'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice',
  endpoint: 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint',
  deepLinkingSettings:
    'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings',
  contentItems: 'https://purl.imsglobal.org/spec/lti-dl/claim/content_items',
  data: 'https://purl.imsglobal.org/spec/lti-dl/claim/data',
} as const;

export const LTI_MESSAGE_TYPES = {
  resourceLinkRequest: 'LtiResourceLinkRequest',
  deepLinkingRequest: 'LtiDeepLinkingRequest',
  deepLinkingResponse: 'LtiDeepLinkingResponse',
} as const;

type JsonObject = Record<string, unknown>;

const JwtHeaderSchema = z
  .object({
    alg: z.string(),
    kid: z.string().min(1),
    typ: z.string().optional(),
  })
  .passthrough();

const JwksSchema = z.object({
  keys: z
    .array(
      z
        .object({
          kty: z.string(),
          kid: z.string().min(1),
          use: z.string().optional(),
          alg: z.string().optional(),
        })
        .passthrough()
    )
    .min(1),
});

function encodeBase64Url(value: string | Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}

function decodeBase64UrlJson(value: string, label: string): JsonObject {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed as JsonObject;
  } catch {
    throw new Error(`LTI ${label} is not valid JSON.`);
  }
}

function decodeJwt(jwt: string) {
  const parts = jwt.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) {
    throw new Error('LTI token must be a compact three-part JWT.');
  }
  return {
    header: decodeBase64UrlJson(parts[0], 'JOSE header'),
    payload: decodeBase64UrlJson(parts[1], 'JWT payload'),
    signingInput: `${parts[0]}.${parts[1]}`,
    signature: Buffer.from(parts[2], 'base64url'),
  };
}

function getRequiredString(
  object: JsonObject,
  key: string,
  label: string
): string {
  const value = object[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`LTI ${label} claim is required.`);
  }
  return value;
}

function getOptionalString(object: JsonObject, key: string): string | null {
  const value = object[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function getRequiredObject(
  object: JsonObject,
  key: string,
  label: string
): JsonObject {
  const value = object[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`LTI ${label} claim is required.`);
  }
  return value as JsonObject;
}

function getStringArray(value: unknown, label: string): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`LTI ${label} must be a non-empty string array.`);
  }
  return value as string[];
}

async function fetchPlatformSigningKey(
  registration: LtiRegistration,
  keyId: string,
  fetchImpl: typeof fetch
) {
  let response: Response;
  try {
    response = await fetchImpl(registration.jwksUrl, {
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    throw new Error('LTI platform JWKS request failed.', { cause: error });
  }
  if (!response.ok) {
    throw new Error(`LTI platform JWKS returned HTTP ${response.status}.`);
  }

  let jwks: z.infer<typeof JwksSchema>;
  try {
    jwks = JwksSchema.parse(await response.json());
  } catch (error) {
    throw new Error('LTI platform JWKS response is malformed.', {
      cause: error,
    });
  }

  const key = jwks.keys.find((candidate) => candidate.kid === keyId);
  if (!key) {
    throw new Error(`LTI platform signing key ${keyId} was not found.`);
  }
  if (key.kty !== 'RSA' || (key.alg && key.alg !== 'RS256')) {
    throw new Error('LTI platform signing key is not an RS256 RSA key.');
  }

  try {
    return createPublicKey({ key: key as JsonWebKey, format: 'jwk' });
  } catch (error) {
    throw new Error('LTI platform signing key is invalid.', { cause: error });
  }
}

function normalizeAudiences(payload: JsonObject): string[] {
  const aud = payload.aud;
  if (typeof aud === 'string' && aud.length > 0) return [aud];
  return getStringArray(aud, 'audience');
}

export type VerifiedLtiLaunch = {
  issuer: string;
  subject: string;
  audience: string[];
  deploymentId: string;
  messageType: string;
  version: '1.3.0';
  targetLinkUri: string;
  roles: string[];
  context: { id: string; label: string | null; title: string | null };
  resourceLink: { id: string; title: string | null } | null;
  person: {
    email: string | null;
    givenName: string | null;
    familyName: string | null;
    name: string | null;
  };
  services: {
    membershipsUrl: string | null;
    nrpsVersions: string[];
    lineItemsUrl: string | null;
    lineItemUrl: string | null;
    agsScopes: string[];
  };
  custom: Record<string, string>;
  deepLinking: {
    returnUrl: string;
    acceptTypes: string[];
    documentTargets: string[];
    acceptsMultiple: boolean;
    autoCreate: boolean;
    data: string;
  } | null;
};

export async function verifyLtiLaunchForm(
  form: { idToken: string; state: string },
  options: {
    registration: LtiRegistration;
    expectedState: string;
    expectedNonce: string;
    expectedMessageType: string;
    nowSeconds?: number;
    fetchImpl?: typeof fetch;
  }
): Promise<VerifiedLtiLaunch> {
  if (!form.state || form.state !== options.expectedState) {
    throw new Error('LTI OIDC state did not match the initiated launch.');
  }

  const decoded = decodeJwt(form.idToken);
  const header = JwtHeaderSchema.parse(decoded.header);
  if (header.alg !== 'RS256') {
    throw new Error('LTI token algorithm must be RS256.');
  }
  for (const prohibited of ['jwk', 'jku', 'x5u', 'x5c']) {
    if (prohibited in decoded.header) {
      throw new Error(`LTI JOSE header must not contain ${prohibited}.`);
    }
  }

  const publicKey = await fetchPlatformSigningKey(
    options.registration,
    header.kid,
    options.fetchImpl ?? fetch
  );
  const verifier = createVerify('RSA-SHA256');
  verifier.update(decoded.signingInput);
  verifier.end();
  if (!verifier.verify(publicKey, decoded.signature)) {
    throw new Error('LTI token signature is invalid.');
  }

  const payload = decoded.payload;
  const issuer = getRequiredString(payload, 'iss', 'issuer');
  if (issuer !== options.registration.issuer) {
    throw new Error('LTI issuer does not match the registration.');
  }

  const audience = normalizeAudiences(payload);
  if (!audience.includes(options.registration.clientId)) {
    throw new Error('LTI audience does not contain the registered client.');
  }
  if (
    audience.length > 1 &&
    getRequiredString(payload, 'azp', 'authorized-party') !==
      options.registration.clientId
  ) {
    throw new Error(
      'LTI authorized-party does not match the registered client.'
    );
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) {
    throw new Error('LTI token is expired.');
  }
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) {
    throw new Error('LTI token issued-at time is invalid.');
  }
  if (payload.nonce !== options.expectedNonce) {
    throw new Error('LTI nonce did not match the initiated launch.');
  }

  const deploymentId = getRequiredString(
    payload,
    LTI_CLAIMS.deploymentId,
    'deployment'
  );
  if (deploymentId !== options.registration.deploymentId) {
    throw new Error('LTI deployment does not match the registration.');
  }
  const messageType = getRequiredString(
    payload,
    LTI_CLAIMS.messageType,
    'message type'
  );
  if (messageType !== options.expectedMessageType) {
    throw new Error('LTI message type does not match the expected flow.');
  }
  const version = getRequiredString(payload, LTI_CLAIMS.version, 'version');
  if (version !== '1.3.0') {
    throw new Error('LTI version must be 1.3.0.');
  }
  const targetLinkUri = getRequiredString(
    payload,
    LTI_CLAIMS.targetLinkUri,
    'target link'
  );
  if (targetLinkUri !== options.registration.targetLinkUri) {
    throw new Error('LTI target link does not match the initiated target.');
  }

  const contextClaim = getRequiredObject(
    payload,
    LTI_CLAIMS.context,
    'context'
  );
  const resourceLinkClaim =
    messageType === LTI_MESSAGE_TYPES.resourceLinkRequest
      ? getRequiredObject(payload, LTI_CLAIMS.resourceLink, 'resource link')
      : null;
  const roles = getStringArray(payload[LTI_CLAIMS.roles], 'roles');
  const nrps = payload[LTI_CLAIMS.namesRoleService];
  const ags = payload[LTI_CLAIMS.endpoint];
  const nrpsClaim =
    nrps && typeof nrps === 'object' && !Array.isArray(nrps)
      ? (nrps as JsonObject)
      : null;
  const agsClaim =
    ags && typeof ags === 'object' && !Array.isArray(ags)
      ? (ags as JsonObject)
      : null;

  const membershipsUrl = nrpsClaim
    ? getRequiredString(
        nrpsClaim,
        'context_memberships_url',
        'NRPS memberships URL'
      )
    : null;
  const lineItemsUrl = agsClaim
    ? getOptionalString(agsClaim, 'lineitems')
    : null;
  const lineItemUrl = agsClaim ? getOptionalString(agsClaim, 'lineitem') : null;
  for (const url of [membershipsUrl, lineItemsUrl, lineItemUrl]) {
    if (url) assertAllowedLtiServiceUrl(url, options.registration);
  }

  const customClaim = payload[LTI_CLAIMS.custom];
  const custom =
    customClaim &&
    typeof customClaim === 'object' &&
    !Array.isArray(customClaim)
      ? Object.fromEntries(
          Object.entries(customClaim).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string'
          )
        )
      : {};
  const deepLinkingClaimValue = payload[LTI_CLAIMS.deepLinkingSettings];
  const deepLinkingClaim =
    deepLinkingClaimValue &&
    typeof deepLinkingClaimValue === 'object' &&
    !Array.isArray(deepLinkingClaimValue)
      ? (deepLinkingClaimValue as JsonObject)
      : null;
  if (
    messageType === LTI_MESSAGE_TYPES.deepLinkingRequest &&
    !deepLinkingClaim
  ) {
    throw new Error('LTI Deep Linking settings claim is required.');
  }
  const deepLinkReturnUrl = deepLinkingClaim
    ? getRequiredString(
        deepLinkingClaim,
        'deep_link_return_url',
        'Deep Linking return URL'
      )
    : null;
  if (deepLinkReturnUrl) {
    assertAllowedLtiServiceUrl(deepLinkReturnUrl, options.registration);
  }

  return {
    issuer,
    subject: getRequiredString(payload, 'sub', 'subject'),
    audience,
    deploymentId,
    messageType,
    version,
    targetLinkUri,
    roles,
    context: {
      id: getRequiredString(contextClaim, 'id', 'context id'),
      label: getOptionalString(contextClaim, 'label'),
      title: getOptionalString(contextClaim, 'title'),
    },
    resourceLink: resourceLinkClaim
      ? {
          id: getRequiredString(resourceLinkClaim, 'id', 'resource link id'),
          title: getOptionalString(resourceLinkClaim, 'title'),
        }
      : null,
    person: {
      email: getOptionalString(payload, 'email'),
      givenName: getOptionalString(payload, 'given_name'),
      familyName: getOptionalString(payload, 'family_name'),
      name: getOptionalString(payload, 'name'),
    },
    services: {
      membershipsUrl,
      nrpsVersions: nrpsClaim
        ? getStringArray(nrpsClaim.service_versions, 'NRPS service versions')
        : [],
      lineItemsUrl,
      lineItemUrl,
      agsScopes: agsClaim ? getStringArray(agsClaim.scope, 'AGS scopes') : [],
    },
    custom,
    deepLinking:
      deepLinkingClaim && deepLinkReturnUrl
        ? {
            returnUrl: deepLinkReturnUrl,
            acceptTypes: getStringArray(
              deepLinkingClaim.accept_types,
              'Deep Linking accepted types'
            ),
            documentTargets: getStringArray(
              deepLinkingClaim.accept_presentation_document_targets,
              'Deep Linking document targets'
            ),
            acceptsMultiple: deepLinkingClaim.accept_multiple === true,
            autoCreate: deepLinkingClaim.auto_create === true,
            data: getRequiredString(
              deepLinkingClaim,
              'data',
              'Deep Linking data'
            ),
          }
        : null,
  };
}

export function signLtiJwt(input: {
  header: { kid: string; typ?: string };
  payload: JsonObject;
  privateKeyPem: string;
}): string {
  const encodedHeader = encodeBase64Url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', ...input.header })
  );
  const encodedPayload = encodeBase64Url(JSON.stringify(input.payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(createPrivateKey(input.privateKeyPem));
  return `${signingInput}.${encodeBase64Url(signature)}`;
}

export function createLtiClientAssertion(input: {
  clientId: string;
  tokenEndpoint: string;
  privateKeyPem: string;
  keyId: string;
  jti?: string;
  nowSeconds?: number;
}): string {
  const tokenEndpoint = LtiNetworkUrlSchema.parse(input.tokenEndpoint);
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  return signLtiJwt({
    header: { kid: input.keyId },
    payload: {
      iss: input.clientId,
      sub: input.clientId,
      aud: tokenEndpoint,
      iat: now,
      exp: now + 300,
      jti: input.jti ?? randomUUID(),
    },
    privateKeyPem: input.privateKeyPem,
  });
}

export function createDeepLinkingResponseJwt(input: {
  clientId: string;
  platformIssuer: string;
  deploymentId: string;
  privateKeyPem: string;
  keyId: string;
  data: string;
  contentItems: unknown[];
  nowSeconds?: number;
}): string {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  return signLtiJwt({
    header: { kid: input.keyId },
    payload: {
      iss: input.clientId,
      aud: input.platformIssuer,
      iat: now,
      exp: now + 300,
      [LTI_CLAIMS.deploymentId]: input.deploymentId,
      [LTI_CLAIMS.messageType]: LTI_MESSAGE_TYPES.deepLinkingResponse,
      [LTI_CLAIMS.version]: '1.3.0',
      [LTI_CLAIMS.data]: input.data,
      [LTI_CLAIMS.contentItems]: input.contentItems,
    },
    privateKeyPem: input.privateKeyPem,
  });
}

export async function requestLtiAccessToken(input: {
  tokenEndpoint: string;
  clientAssertion: string;
  scopes: string[];
  fetchImpl?: typeof fetch;
}): Promise<{
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
}> {
  const tokenEndpoint = LtiNetworkUrlSchema.parse(input.tokenEndpoint);
  if (input.scopes.length === 0 || input.scopes.some((scope) => !scope)) {
    throw new Error('LTI service token requires at least one scope.');
  }
  const response = await (input.fetchImpl ?? fetch)(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type:
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: input.clientAssertion,
      scope: input.scopes.join(' '),
    }),
  });
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new Error('LTI token endpoint returned malformed JSON.', {
      cause: error,
    });
  }
  if (!response.ok) {
    const detail =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(`LTI token request failed: ${detail}.`);
  }
  const parsed = z
    .object({
      access_token: z.string().min(1),
      token_type: z.literal('Bearer'),
      expires_in: z.number().int().positive(),
      scope: z.string().min(1),
    })
    .parse(body);
  return {
    accessToken: parsed.access_token,
    tokenType: parsed.token_type,
    expiresIn: parsed.expires_in,
    scope: parsed.scope,
  };
}
