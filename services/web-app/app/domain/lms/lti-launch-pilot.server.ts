import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';
import { LtiNetworkUrlSchema } from './lti-registration';

const MAX_HINT_LENGTH = 4096;
const MAX_IDENTIFIER_LENGTH = 255;
const INSTRUCTOR_ROLE =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor';
const INSTRUCTOR_SUBROLE_PREFIX =
  'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#';
const LEARNER_ROLE =
  'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';
const LEARNER_SUBROLE_PREFIX =
  'http://purl.imsglobal.org/vocab/lis/v2/membership/Learner#';

export type LtiMembershipRole = 'TEACHER' | 'STUDENT';

export type LtiLoginInitiation = {
  issuer: string;
  clientId: string;
  deploymentId: string;
  loginHint: string;
  messageHint: string | null;
  targetLinkUri: string;
};

function getSingleParameter(
  parameters: URLSearchParams,
  name: string,
  options: { required: boolean; maxLength: number }
) {
  const values = parameters.getAll(name);
  if (values.length > 1) {
    throw new Error(`LTI login initiation parameter ${name} must be singular.`);
  }
  const value = values[0] ?? null;
  if (value === null) {
    if (options.required) {
      throw new Error(`LTI login initiation parameter ${name} is required.`);
    }
    return null;
  }
  if (!value || value.length > options.maxLength) {
    throw new Error(`LTI login initiation parameter ${name} is invalid.`);
  }
  return value;
}

export function parseLtiLoginInitiation(
  parameters: URLSearchParams
): LtiLoginInitiation {
  const issuer = getSingleParameter(parameters, 'iss', {
    required: true,
    maxLength: 2048,
  })!;
  const clientId = getSingleParameter(parameters, 'client_id', {
    required: true,
    maxLength: MAX_IDENTIFIER_LENGTH,
  })!;
  const deploymentId = getSingleParameter(parameters, 'lti_deployment_id', {
    required: true,
    maxLength: MAX_IDENTIFIER_LENGTH,
  })!;
  const loginHint = getSingleParameter(parameters, 'login_hint', {
    required: true,
    maxLength: MAX_HINT_LENGTH,
  })!;
  const messageHint = getSingleParameter(parameters, 'lti_message_hint', {
    required: false,
    maxLength: MAX_HINT_LENGTH,
  });
  const targetLinkUri = getSingleParameter(parameters, 'target_link_uri', {
    required: true,
    maxLength: 2048,
  })!;

  LtiNetworkUrlSchema.parse(issuer);
  LtiNetworkUrlSchema.parse(targetLinkUri);
  z.string().min(1).max(MAX_IDENTIFIER_LENGTH).parse(clientId);
  z.string().min(1).max(MAX_IDENTIFIER_LENGTH).parse(deploymentId);

  return {
    issuer,
    clientId,
    deploymentId,
    loginHint,
    messageHint,
    targetLinkUri,
  };
}

export function buildLtiOidcAuthorizationUrl(input: {
  authorizationEndpoint: string;
  clientId: string;
  launchUrl: string;
  loginHint: string;
  messageHint: string | null;
  state: string;
  nonce: string;
}) {
  const authorizationUrl = new URL(input.authorizationEndpoint);
  const parameters = {
    scope: 'openid',
    response_type: 'id_token',
    response_mode: 'form_post',
    prompt: 'none',
    client_id: input.clientId,
    redirect_uri: input.launchUrl,
    login_hint: input.loginHint,
    state: input.state,
    nonce: input.nonce,
  };
  for (const [name, value] of Object.entries(parameters)) {
    authorizationUrl.searchParams.set(name, value);
  }
  if (input.messageHint !== null) {
    authorizationUrl.searchParams.set('lti_message_hint', input.messageHint);
  }
  return authorizationUrl;
}

export function generateLtiOneTimeValue() {
  return randomBytes(32).toString('base64url');
}

export function hashLtiOneTimeValue(value: string) {
  if (!value) throw new Error('LTI one-time values must be non-empty.');
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function ltiOneTimeValueMatches(value: string, expectedHash: string) {
  const actual = Buffer.from(hashLtiOneTimeValue(value), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function deriveLtiSubjectHash(input: {
  hmacSecret: string;
  registrationId: string;
  subject: string;
}) {
  if (!input.hmacSecret || !input.registrationId || !input.subject) {
    throw new Error('LTI subject hashing requires non-empty scoped inputs.');
  }
  return createHmac('sha256', input.hmacSecret)
    .update(input.registrationId, 'utf8')
    .update('\0', 'utf8')
    .update(input.subject, 'utf8')
    .digest('hex');
}

export function mapLtiRolesToMembershipRole(
  roles: string[]
): LtiMembershipRole {
  const isInstructor = roles.some(
    (role) =>
      role === INSTRUCTOR_ROLE || role.startsWith(INSTRUCTOR_SUBROLE_PREFIX)
  );
  const isLearner = roles.some(
    (role) => role === LEARNER_ROLE || role.startsWith(LEARNER_SUBROLE_PREFIX)
  );
  if (isInstructor === isLearner) {
    throw new Error(
      'LTI launch roles must map to exactly one Yawp membership role.'
    );
  }
  return isInstructor ? 'TEACHER' : 'STUDENT';
}

export function resolveLtiLaunchDestination(input: {
  classId: string;
  role: LtiMembershipRole;
}) {
  if (!input.classId) throw new Error('LTI class mapping is required.');
  if (input.role !== 'TEACHER' && input.role !== 'STUDENT') {
    throw new Error('LTI membership role is invalid.');
  }
  return input.role === 'TEACHER'
    ? `/app/my-classes/${encodeURIComponent(input.classId)}`
    : `/app?ltiClassId=${encodeURIComponent(input.classId)}`;
}
