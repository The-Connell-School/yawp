import { z } from 'zod';
import { BlockList, isIP } from 'node:net';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

function parseUrl(value: string) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const blockedLtiAddresses = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedLtiAddresses.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 32],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:20::', 28],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  blockedLtiAddresses.addSubnet(network, prefix, 'ipv6');
}

export function isBlockedLtiAddress(address: string) {
  const hostname = address.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
  const ipVersion = isIP(hostname);
  if (ipVersion === 4) return blockedLtiAddresses.check(hostname, 'ipv4');
  if (ipVersion === 6) return blockedLtiAddresses.check(hostname, 'ipv6');
  return false;
}

function validateAbsoluteUrl(value: string, context: z.RefinementCtx) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LTI network endpoint must be an absolute URL.',
    });
    return;
  }
  if (url.username || url.password) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LTI network endpoints must not contain credentials.',
    });
  }
  if (url.hash) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LTI network endpoints must not contain a fragment.',
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'LTI network endpoints must use HTTP or HTTPS.',
    });
  }
}

export const LtiNetworkUrlSchema = z
  .string()
  .min(1)
  .superRefine(validateAbsoluteUrl);

const LtiServiceOriginSchema = LtiNetworkUrlSchema.superRefine(
  (value, context) => {
    const url = parseUrl(value);
    if (!url) return;
    if (
      value !== url.origin ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Allowed LTI service origins must contain only scheme and host.',
      });
    }
  }
);

const LtiIdentifierSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(
    /^[\x00-\x7f]+$/,
    'LTI identifiers must contain only ASCII characters.'
  );

const RegistrationShape = z
  .object({
    id: z.string().min(1),
    organizationId: z.string().min(1),
    provider: z.enum(['blackboard', 'canvas', 'generic-lti-1p3']),
    displayName: z.string().min(1),
    transportMode: z.enum(['https', 'loopback-http']).default('https'),
    issuer: LtiNetworkUrlSchema,
    clientId: z.string().min(1),
    allowedAudiences: z.array(z.string().min(1)).min(1),
    deploymentId: LtiIdentifierSchema,
    authorizationEndpoint: LtiNetworkUrlSchema,
    tokenEndpoint: LtiNetworkUrlSchema,
    jwksUrl: LtiNetworkUrlSchema,
    allowedServiceOrigins: z.array(LtiServiceOriginSchema).min(1),
    loginInitiationUrl: LtiNetworkUrlSchema,
    launchUrl: LtiNetworkUrlSchema,
    deepLinkingLaunchUrl: LtiNetworkUrlSchema,
    toolJwksUrl: LtiNetworkUrlSchema,
    allowedTargetLinkUris: z.array(LtiNetworkUrlSchema).min(1),
    enabledScopes: z.array(z.string().url()).min(1),
    enabled: z.boolean().default(false),
  })
  .strict();

const NETWORK_FIELDS = [
  'issuer',
  'authorizationEndpoint',
  'tokenEndpoint',
  'jwksUrl',
  'loginInitiationUrl',
  'launchUrl',
  'deepLinkingLaunchUrl',
  'toolJwksUrl',
] as const;

function transportError(value: string, mode: 'https' | 'loopback-http') {
  const url = parseUrl(value);
  if (!url) return null;
  if (mode === 'https') {
    if (url.protocol !== 'https:') {
      return 'HTTPS transport is required by this LTI registration.';
    }
    return isBlockedLtiAddress(url.hostname)
      ? 'HTTPS LTI endpoints must not use private, loopback, or link-local addresses.'
      : null;
  }
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
    ? null
    : 'The loopback-http transport capability permits only explicit loopback HTTP endpoints.';
}

const LtiRegistrationSchema = RegistrationShape.superRefine(
  (registration, context) => {
    for (const field of NETWORK_FIELDS) {
      const message = transportError(
        registration[field],
        registration.transportMode
      );
      if (message) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message,
          path: [field],
        });
      }
    }
    for (const [field, values] of [
      ['allowedServiceOrigins', registration.allowedServiceOrigins],
      ['allowedTargetLinkUris', registration.allowedTargetLinkUris],
    ] as const) {
      for (const [index, value] of values.entries()) {
        const message = transportError(value, registration.transportMode);
        if (message) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message,
            path: [field, index],
          });
        }
      }
    }
    const issuer = parseUrl(registration.issuer);
    if (issuer?.search) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LTI issuer must not contain a query string.',
        path: ['issuer'],
      });
    }
    if (!registration.allowedAudiences.includes(registration.clientId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'LTI allowed audiences must include the registered client id.',
        path: ['allowedAudiences'],
      });
    }
    for (const requiredTarget of [
      registration.launchUrl,
      registration.deepLinkingLaunchUrl,
    ]) {
      const requiredTargetUrl = parseUrl(requiredTarget);
      if (
        requiredTargetUrl &&
        !registration.allowedTargetLinkUris.some(
          (candidate) =>
            parseUrl(candidate)?.toString() === requiredTargetUrl.toString()
        )
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'LTI allowed target links must include every launch URL.',
          path: ['allowedTargetLinkUris'],
        });
      }
    }
  }
);

export type LtiRegistration = z.infer<typeof LtiRegistrationSchema>;

export function parseLtiRegistration(value: unknown): LtiRegistration {
  const registration = LtiRegistrationSchema.parse(value);
  if (registration.transportMode !== 'https') {
    throw new Error(
      'Loopback LTI transport is reserved for the in-process network harness and cannot be loaded from registration data.'
    );
  }
  return registration;
}

export const BLACKBOARD_REFERENCE_PROFILE = {
  provider: 'blackboard',
  displayName: 'Blackboard Learn Ultra / SaaS',
  issuer: 'https://blackboard.com',
  tokenEndpoint:
    'https://developer.blackboard.com/api/v1/gateway/oauth2/jwttoken',
  supportedAlgorithms: ['RS256'],
} as const;

export function assertRegistrationTransportUrl(
  value: string,
  registration: LtiRegistration
): URL {
  const parsed = LtiNetworkUrlSchema.parse(value);
  const message = transportError(parsed, registration.transportMode);
  if (message) throw new Error(message);
  return new URL(parsed);
}

export function assertAllowedLtiServiceUrl(
  value: string,
  registration: LtiRegistration
): URL {
  const url = new URL(LtiNetworkUrlSchema.parse(value));
  if (!registration.allowedServiceOrigins.includes(url.origin)) {
    throw new Error(`LTI service origin is not allowed: ${url.origin}`);
  }
  const message = transportError(url.toString(), registration.transportMode);
  if (message) throw new Error(message);
  return url;
}

export function assertAllowedLtiTargetLink(
  value: string,
  registration: LtiRegistration
): URL {
  const url = assertRegistrationTransportUrl(value, registration);
  if (
    !registration.allowedTargetLinkUris.some(
      (candidate) => new URL(candidate).toString() === url.toString()
    )
  ) {
    throw new Error('LTI target link is not allowed by the registration.');
  }
  return url;
}
