import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

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
    const url = new URL(value);
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

const RegistrationShape = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  provider: z.enum(['blackboard', 'canvas', 'generic-lti-1p3']),
  displayName: z.string().min(1),
  transportMode: z.enum(['https', 'loopback-http']).default('https'),
  issuer: LtiNetworkUrlSchema,
  clientId: z.string().min(1),
  allowedAudiences: z.array(z.string().min(1)).min(1),
  deploymentId: z.string().min(1),
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
});

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
  const url = new URL(value);
  if (mode === 'https') {
    return url.protocol === 'https:'
      ? null
      : 'HTTPS transport is required by this LTI registration.';
  }
  return url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname)
    ? null
    : 'The loopback-http transport capability permits only explicit loopback HTTP endpoints.';
}

export const LtiRegistrationSchema = RegistrationShape.superRefine(
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
    const issuer = new URL(registration.issuer);
    if (issuer.search) {
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
      if (!registration.allowedTargetLinkUris.includes(requiredTarget)) {
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
  return LtiRegistrationSchema.parse(value);
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
  if (!registration.allowedTargetLinkUris.includes(url.toString())) {
    throw new Error('LTI target link is not allowed by the registration.');
  }
  return url;
}
