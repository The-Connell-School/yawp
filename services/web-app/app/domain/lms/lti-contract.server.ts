import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomUUID,
  type JsonWebKey,
} from 'node:crypto';
import { z } from 'zod';
import {
  assertAllowedLtiTargetLink,
  assertAllowedLtiServiceUrl,
  assertRegistrationTransportUrl,
  LtiNetworkUrlSchema,
  type LtiRegistration,
} from './lti-registration';
import {
  fetchLtiNetwork,
  finishLtiNetwork,
  LtiHttpError,
  readLtiJson,
  throwLtiHttpStatus,
} from './lti-http.server';

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

const ExplicitIsoDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    'Date-time must be ISO 8601 with an explicit time-zone designator.'
  )
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date-time.');

function withQualifiedExtensions<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  standardKeys: ReadonlySet<string>
) {
  return schema.catchall(z.unknown()).superRefine((value, context) => {
    for (const key of Object.keys(value)) {
      if (standardKeys.has(key) || URL.canParse(key)) continue;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [key],
        message: 'Extension property names must be fully qualified URLs.',
      });
    }
  });
}

const DeepLinkLineItemSchema = withQualifiedExtensions(
  z.object({
    scoreMaximum: z.number().positive(),
    label: z.string().min(1).optional(),
    resourceId: z.string().min(1).optional(),
    tag: z.string().min(1).optional(),
    gradesReleased: z.boolean().optional(),
  }),
  new Set(['scoreMaximum', 'label', 'resourceId', 'tag', 'gradesReleased'])
);

const DeepLinkImageSchema = z
  .object({
    url: z.string().url(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();

const DeepLinkWindowSchema = z
  .object({
    targetName: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    windowFeatures: z.string().optional(),
  })
  .strict();

const DeepLinkIframeSchema = z
  .object({
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
  })
  .strict();

const DeepLinkTimePeriodSchema = z
  .object({
    startDateTime: ExplicitIsoDateTimeSchema.optional(),
    endDateTime: ExplicitIsoDateTimeSchema.optional(),
  })
  .strict();

export const LtiDeepLinkContentItemSchema = withQualifiedExtensions(
  z.object({
    type: z.literal('ltiResourceLink'),
    title: z.string().min(1).optional(),
    url: z.string().url().optional(),
    text: z.string().optional(),
    icon: DeepLinkImageSchema.optional(),
    thumbnail: DeepLinkImageSchema.optional(),
    window: DeepLinkWindowSchema.optional(),
    iframe: DeepLinkIframeSchema.optional(),
    custom: z.record(z.string(), z.string()).optional(),
    lineItem: DeepLinkLineItemSchema.optional(),
    available: DeepLinkTimePeriodSchema.optional(),
    submission: DeepLinkTimePeriodSchema.optional(),
  }),
  new Set([
    'type',
    'title',
    'url',
    'text',
    'icon',
    'thumbnail',
    'window',
    'iframe',
    'custom',
    'lineItem',
    'available',
    'submission',
  ])
);

export type LtiDeepLinkContentItem = z.infer<
  typeof LtiDeepLinkContentItemSchema
>;

type JsonObject = Record<string, unknown>;

const LTI_ACCESS_GRANT_BRAND = Symbol('yawp.lti-access-grant');

function fingerprintLtiRegistration(registration: LtiRegistration) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        id: registration.id,
        organizationId: registration.organizationId,
        provider: registration.provider,
        transportMode: registration.transportMode,
        issuer: registration.issuer,
        clientId: registration.clientId,
        allowedAudiences: registration.allowedAudiences,
        deploymentId: registration.deploymentId,
        authorizationEndpoint: registration.authorizationEndpoint,
        tokenEndpoint: registration.tokenEndpoint,
        jwksUrl: registration.jwksUrl,
        allowedServiceOrigins: registration.allowedServiceOrigins,
        loginInitiationUrl: registration.loginInitiationUrl,
        launchUrl: registration.launchUrl,
        deepLinkingLaunchUrl: registration.deepLinkingLaunchUrl,
        toolJwksUrl: registration.toolJwksUrl,
        allowedTargetLinkUris: registration.allowedTargetLinkUris,
        enabledScopes: registration.enabledScopes,
      })
    )
    .digest('base64url');
}

export type LtiAccessGrant = Readonly<{
  [LTI_ACCESS_GRANT_BRAND]: true;
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
  scopes: readonly string[];
  registrationId: string;
  organizationId: string;
  deploymentId: string;
  registrationFingerprint: string;
  expiresAtEpochSeconds: number;
}>;

export function assertLtiAccessGrant(
  grant: LtiAccessGrant,
  registration: LtiRegistration,
  acceptedScopes: string | readonly string[],
  nowSeconds = Math.floor(Date.now() / 1000)
) {
  if (!registration.enabled) throw new Error('LTI registration is disabled.');
  if (
    !grant ||
    grant[LTI_ACCESS_GRANT_BRAND] !== true ||
    grant.registrationId !== registration.id ||
    grant.organizationId !== registration.organizationId ||
    grant.deploymentId !== registration.deploymentId ||
    grant.registrationFingerprint !== fingerprintLtiRegistration(registration)
  ) {
    throw new Error('LTI access grant is not bound to this registration.');
  }
  if (grant.expiresAtEpochSeconds <= nowSeconds) {
    throw new Error('LTI access grant has expired.');
  }
  if (
    grant.scopes.some((scope) => !registration.enabledScopes.includes(scope))
  ) {
    throw new Error('LTI access grant contains a disabled scope.');
  }
  const candidates = Array.isArray(acceptedScopes)
    ? acceptedScopes
    : [acceptedScopes];
  if (!candidates.some((scope) => grant.scopes.includes(scope))) {
    throw new Error('LTI access grant lacks the required scope.');
  }
  return grant.accessToken;
}

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

function getOptionalOpaqueString(
  object: JsonObject,
  key: string
): string | null {
  const value = object[key];
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    throw new Error(`LTI ${key} claim must be a string when present.`);
  }
  return value;
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

function getOptionalObject(object: JsonObject, key: string): JsonObject | null {
  const value = object[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function getStringArray(
  value: unknown,
  label: string,
  options: { allowEmpty?: boolean } = {}
): string[] {
  if (
    !Array.isArray(value) ||
    (!options.allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error(`LTI ${label} must be a non-empty string array.`);
  }
  return value as string[];
}

async function fetchPlatformSigningKey(
  registration: LtiRegistration,
  keyId: string,
  timeoutMs?: number
) {
  assertRegistrationTransportUrl(registration.jwksUrl, registration);
  const response = await fetchLtiNetwork({
    operation: 'LTI platform JWKS',
    url: registration.jwksUrl,
    registration,
    timeoutMs,
    init: {
      headers: { accept: 'application/jwk-set+json, application/json' },
    },
  });
  if (!response.ok) {
    throwLtiHttpStatus(response, 'LTI platform JWKS');
  }
  const mediaType = response.headers
    .get('content-type')
    ?.split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (
    !['application/jwk-set+json', 'application/json'].includes(mediaType ?? '')
  ) {
    finishLtiNetwork(response);
    throw new Error(
      'LTI platform JWKS response used an unexpected media type.'
    );
  }

  let jwks: z.infer<typeof JwksSchema>;
  try {
    jwks = JwksSchema.parse(await readLtiJson(response, 'LTI platform JWKS'));
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
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
  subject: string | null;
  audience: string[];
  deploymentId: string;
  messageType: string;
  version: '1.3.0';
  targetLinkUri: string;
  roles: string[];
  context: { id: string; label: string | null; title: string | null } | null;
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
    acceptLineItem: boolean | null;
    data: string | null;
  } | null;
};

export async function verifyLtiLaunchForm(
  form: { idToken: string; state: string },
  options: {
    registration: LtiRegistration;
    expectedState: string;
    expectedNonce: string;
    expectedTargetLinkUri: string;
    expectedMessageType:
      | typeof LTI_MESSAGE_TYPES.resourceLinkRequest
      | typeof LTI_MESSAGE_TYPES.deepLinkingRequest;
    nowSeconds?: number;
    timeoutMs?: number;
  }
): Promise<VerifiedLtiLaunch> {
  if (!options.registration.enabled) {
    throw new Error('LTI registration is disabled.');
  }
  if (
    !options.expectedState ||
    !options.expectedNonce ||
    !options.expectedTargetLinkUri
  ) {
    throw new Error('LTI launch transaction values must be non-empty.');
  }
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
    options.timeoutMs
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
  if (
    !audience.includes(options.registration.clientId) ||
    audience.some(
      (candidate) => !options.registration.allowedAudiences.includes(candidate)
    )
  ) {
    throw new Error('LTI audience is not allowed by the registration.');
  }
  const authorizedParty = getOptionalString(payload, 'azp');
  if (
    (audience.length > 1 && !authorizedParty) ||
    (authorizedParty && authorizedParty !== options.registration.clientId)
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
  if (payload.exp <= payload.iat) {
    throw new Error('LTI token expiry must be after its issued-at time.');
  }
  if (payload.nbf !== undefined) {
    if (typeof payload.nbf !== 'number' || payload.nbf > now + 60) {
      throw new Error('LTI token is not yet valid.');
    }
    if (payload.nbf >= payload.exp) {
      throw new Error('LTI token not-before time must precede expiry.');
    }
  }
  if (payload.iat < now - 300) {
    throw new Error('LTI token issued-at time is too old.');
  }
  if (payload.exp - payload.iat > 600) {
    throw new Error('LTI token lifetime exceeds 10 minutes.');
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
  assertAllowedLtiTargetLink(
    options.expectedTargetLinkUri,
    options.registration
  );
  if (targetLinkUri !== options.expectedTargetLinkUri) {
    throw new Error('LTI target link does not match the initiated target.');
  }

  const isResourceLaunch =
    messageType === LTI_MESSAGE_TYPES.resourceLinkRequest;
  const contextClaim = isResourceLaunch
    ? getRequiredObject(payload, LTI_CLAIMS.context, 'context')
    : getOptionalObject(payload, LTI_CLAIMS.context);
  const resourceLinkClaim = isResourceLaunch
    ? getRequiredObject(payload, LTI_CLAIMS.resourceLink, 'resource link')
    : null;
  const roles =
    payload[LTI_CLAIMS.roles] === undefined && !isResourceLaunch
      ? []
      : getStringArray(payload[LTI_CLAIMS.roles], 'roles', {
          allowEmpty: true,
        });
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
    subject: isResourceLaunch
      ? getRequiredString(payload, 'sub', 'subject')
      : getOptionalString(payload, 'sub'),
    audience,
    deploymentId,
    messageType,
    version,
    targetLinkUri,
    roles,
    context: contextClaim
      ? {
          id: getRequiredString(contextClaim, 'id', 'context id'),
          label: getOptionalString(contextClaim, 'label'),
          title: getOptionalString(contextClaim, 'title'),
        }
      : null,
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
              'Deep Linking document targets',
              { allowEmpty: true }
            ),
            acceptsMultiple: deepLinkingClaim.accept_multiple === true,
            autoCreate: deepLinkingClaim.auto_create === true,
            acceptLineItem:
              typeof deepLinkingClaim.accept_lineitem === 'boolean'
                ? deepLinkingClaim.accept_lineitem
                : null,
            data: getOptionalOpaqueString(deepLinkingClaim, 'data'),
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
  deploymentId: string;
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
      aud: [tokenEndpoint],
      iat: now,
      exp: now + 300,
      jti: input.jti ?? randomUUID(),
      [LTI_CLAIMS.deploymentId]: input.deploymentId,
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
  nonce: string;
  data?: string | null;
  contentItems: unknown[];
  acceptTypes: string[];
  documentTargets: string[];
  acceptsMultiple: boolean;
  acceptLineItem: boolean | null;
  nowSeconds?: number;
}): string {
  if (!input.nonce) throw new Error('Deep Linking response nonce is required.');
  const contentItems = input.contentItems.map((item) =>
    LtiDeepLinkContentItemSchema.parse(item)
  );
  if (contentItems.length > 1 && !input.acceptsMultiple) {
    throw new Error('Deep Linking request did not accept multiple items.');
  }
  for (const item of contentItems) {
    if (!input.acceptTypes.includes(item.type)) {
      throw new Error(`Deep Linking request did not accept ${item.type}.`);
    }
    if (item.lineItem && input.acceptLineItem !== true) {
      throw new Error('Deep Linking request did not accept line items.');
    }
    if (item.window && !input.documentTargets.includes('window')) {
      throw new Error('Deep Linking request did not accept window content.');
    }
    if (item.iframe && !input.documentTargets.includes('iframe')) {
      throw new Error('Deep Linking request did not accept iframe content.');
    }
  }
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  return signLtiJwt({
    header: { kid: input.keyId },
    payload: {
      iss: input.clientId,
      aud: input.platformIssuer,
      iat: now,
      exp: now + 300,
      nonce: input.nonce,
      [LTI_CLAIMS.deploymentId]: input.deploymentId,
      [LTI_CLAIMS.messageType]: LTI_MESSAGE_TYPES.deepLinkingResponse,
      [LTI_CLAIMS.version]: '1.3.0',
      ...(input.data !== undefined && input.data !== null
        ? { [LTI_CLAIMS.data]: input.data }
        : {}),
      [LTI_CLAIMS.contentItems]: contentItems,
    },
    privateKeyPem: input.privateKeyPem,
  });
}

export async function requestLtiAccessToken(input: {
  registration: LtiRegistration;
  clientAssertion: string;
  scopes: string[];
  advertisedScopes: string[];
  timeoutMs?: number;
}): Promise<LtiAccessGrant> {
  if (!input.registration.enabled) {
    throw new Error('LTI registration is disabled.');
  }
  const tokenEndpoint = assertRegistrationTransportUrl(
    input.registration.tokenEndpoint,
    input.registration
  );
  const assertionPayload = decodeJwt(input.clientAssertion).payload;
  const assertionAudiences = normalizeAudiences(assertionPayload);
  if (
    assertionPayload.iss !== input.registration.clientId ||
    assertionPayload.sub !== input.registration.clientId ||
    assertionAudiences.length !== 1 ||
    assertionAudiences[0] !== tokenEndpoint.toString() ||
    assertionPayload[LTI_CLAIMS.deploymentId] !==
      input.registration.deploymentId
  ) {
    throw new Error('LTI client assertion is not bound to the registration.');
  }
  if (input.scopes.length === 0 || input.scopes.some((scope) => !scope)) {
    throw new Error('LTI service token requires at least one scope.');
  }
  if (
    input.scopes.some(
      (scope) => !input.registration.enabledScopes.includes(scope)
    )
  ) {
    throw new Error('LTI service scope is not approved by the registration.');
  }
  if (input.scopes.some((scope) => !input.advertisedScopes.includes(scope))) {
    throw new Error('LTI service scope was not advertised by the launch.');
  }
  const response = await fetchLtiNetwork({
    operation: 'LTI token endpoint',
    url: tokenEndpoint,
    registration: input.registration,
    timeoutMs: input.timeoutMs,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_assertion_type:
          'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        client_assertion: input.clientAssertion,
        scope: input.scopes.join(' '),
      }),
    },
  });
  if (!response.ok) {
    throwLtiHttpStatus(response, 'LTI token endpoint');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    finishLtiNetwork(response);
    throw new Error(
      'LTI token endpoint response used an unexpected media type.'
    );
  }
  let body: unknown;
  try {
    body = await readLtiJson(response, 'LTI token endpoint');
  } catch (error) {
    if (error instanceof LtiHttpError) throw error;
    throw new Error('LTI token endpoint returned malformed JSON.', {
      cause: error,
    });
  }
  const parsed = z
    .object({
      access_token: z.string().min(1),
      token_type: z
        .string()
        .refine((value) => value.toLowerCase() === 'bearer')
        .transform(() => 'Bearer' as const),
      expires_in: z.number().int().positive(),
      scope: z.string().min(1),
    })
    .parse(body);
  const returnedScopes = parsed.scope.split(' ').filter(Boolean);
  if (returnedScopes.some((scope) => !input.scopes.includes(scope))) {
    throw new Error('LTI token endpoint returned scope beyond the request.');
  }
  return Object.freeze({
    [LTI_ACCESS_GRANT_BRAND]: true as const,
    accessToken: parsed.access_token,
    tokenType: parsed.token_type,
    expiresIn: parsed.expires_in,
    scope: parsed.scope,
    scopes: Object.freeze([...returnedScopes]),
    registrationId: input.registration.id,
    organizationId: input.registration.organizationId,
    deploymentId: input.registration.deploymentId,
    registrationFingerprint: fingerprintLtiRegistration(input.registration),
    expiresAtEpochSeconds: Math.floor(Date.now() / 1000) + parsed.expires_in,
  });
}
