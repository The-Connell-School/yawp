import { z } from 'zod';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', '[::1]', 'localhost']);

function validateNetworkUrl(value: string, context: z.RefinementCtx) {
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

  const secure = url.protocol === 'https:';
  const explicitLoopback =
    url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname);
  if (!secure && !explicitLoopback) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'LTI network endpoints must use HTTPS; HTTP is limited to explicit loopback hosts.',
    });
  }
}

export const LtiNetworkUrlSchema = z
  .string()
  .min(1)
  .superRefine(validateNetworkUrl);

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

export const LtiRegistrationSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  provider: z.enum(['blackboard', 'canvas', 'generic-lti-1p3']),
  displayName: z.string().min(1),
  issuer: LtiNetworkUrlSchema,
  clientId: z.string().min(1),
  deploymentId: z.string().min(1),
  authorizationEndpoint: LtiNetworkUrlSchema,
  tokenEndpoint: LtiNetworkUrlSchema,
  jwksUrl: LtiNetworkUrlSchema,
  allowedServiceOrigins: z.array(LtiServiceOriginSchema).min(1),
  targetLinkUri: LtiNetworkUrlSchema,
  enabled: z.boolean().default(false),
});

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

export function assertAllowedLtiServiceUrl(
  value: string,
  registration: LtiRegistration
): URL {
  const parsed = LtiNetworkUrlSchema.parse(value);
  const url = new URL(parsed);
  if (!registration.allowedServiceOrigins.includes(url.origin)) {
    throw new Error(`LTI service origin is not allowed: ${url.origin}`);
  }
  return url;
}
