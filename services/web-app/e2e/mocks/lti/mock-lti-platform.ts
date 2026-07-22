import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  type JsonWebKey,
} from 'node:crypto';
import {
  createServer,
  request as requestHttp,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { LtiRegistration } from '../../../app/domain/lms/lti-registration';

const PLATFORM_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCvqpmugoZOq/Xe
eVnlPtfsXm8HprKzrll77DntwIAYF2grl9HAZ+R15FusGou4PvpRc1GnukhwujMk
EZOEliLFAEO950qvVO+Ui5sEMslC8u50Bhp6qKKTCZx4OhYHeZt3mW0dxe5Rg9s3
iv76ITreY+isGt3FzhWk1uy1FkA5+pzXKeQA91QyubGGGftXhEYTNjOrGRXYQ0pN
9yWrQR5bMxgx/HZ0ExYs4E3tZ7V/fj1/WiysZd0o0FOpprk3SUo6R6y3NIYmOqhz
f9cJg+9ecXnRMyNb7vH5nRZivKw7eeaOlueLb5xWgm3PQn8Uw43wCKMiWaRxvbtq
Cu4Q8cB1AgMBAAECggEAFlwqz7HBksYEt9rOfIWxSl8C1wB7ArAQp9t7zC2SoH5q
PhJHGqyewfrdSFzgqAUsK634GNd3XRH2bILoOho6NsU/2i5UrVisXkYe5zvnrmPp
wk78k9xfRUQV7J/IKg9qoKCg6QdGvI2CG+HPbttH+QLSnQWWcRU4YBETdEFuz3JG
wO8KjZCP9jZl7VY/wSuY2XhGVc4DbyycGmFPUrYSysXQ0J47u2gy86Wy2FRRnWeB
a5DAQ0wtRIaFhWJB21RQWzuNikcG2RnlJNC4Jgmo93MnKg7PXmVeBnqsGSrtwkee
HceoBYyeBmSGlBs6WC7EFZCvjtZeaggG7zsco8jCgQKBgQDqAdwOjFLqRV8MxdI1
tIRF8PCj/9MiPM7jhwy0dDEOmc5u2EBKXD3CGsggiUxssKCBQNhb2n/gfl7oKT7U
hvs3BfuM3grUrUkkHSPFJmIRSAy68xKvNNE3kWXy7GUZ03+SsLfomLIWU3ZQD9r5
R5ogdPm/cy0qHkp9l7zpvbPB8QKBgQDALRQIgIPWapyeYEhaL1No/jWcANIoeiBG
5HSrpQGH17cp65gSgqFFOOz0EJlqBWUqz6gO7l0KFetPwzCd3480bDa95aqMdWwT
39ix/pLE0+ti0+CzlCizmVs1wd1X8F/0Uo3c2PFWiYFwCKHQ8aWFpxpFWTAfO0Eg
/1p68BOixQKBgEaF7vL3eVmfNIkd6T9EOwT1GyDhzZio6NULc1nDFrHGyr7/L0j5
yacA+UVM+5paFNU/XLU6AYX/r8yZ+ZSFZZpslCYdGPiFjOB0Y75b1fxNUYDaFsx0
x4TOrgHrGoERC4aC+boAotM1rhds39p2qM2VU1tOc9MYs+xr2YQ8JruRAoGADx58
yP5zYNcaY0tn5dB7W3NEfHWEEzMofutSUn601B8ghefHGw2z6mJEIh98Ml8iSm/z
5NjT8QswbCILHSCNf65T0DTVah+C1T1zKu3AVkPl7OyGbRpm6VpTVrNd2qFKq0oj
ZxCaTBidWlcThAC+6PjwlCwkIRDkWtg8IhfpM5ECgYBC2bjBUWvv7wYfiuK+FCtM
bgPHKzp8COzcQ3AQxFYYGWFnaJC9nN+6Ek63Ss4qI/sDet9oDeZuJ6SIF2E8Fh0R
nIJwtzp387Rq+f/cYNsWPHpzLU76V1vt4g/9iMWDYJK/w1yDl7qUxyTlnOARb8Ej
UUsWkVVphd4vuFptOTC+2w==
-----END PRIVATE KEY-----`;

const PLATFORM_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAr6qZroKGTqv13nlZ5T7X
7F5vB6ays65Ze+w57cCAGBdoK5fRwGfkdeRbrBqLuD76UXNRp7pIcLozJBGThJYi
xQBDvedKr1TvlIubBDLJQvLudAYaeqiikwmceDoWB3mbd5ltHcXuUYPbN4r++iE6
3mPorBrdxc4VpNbstRZAOfqc1ynkAPdUMrmxhhn7V4RGEzYzqxkV2ENKTfclq0Ee
WzMYMfx2dBMWLOBN7We1f349f1osrGXdKNBTqaa5N0lKOkestzSGJjqoc3/XCYPv
XnF50TMjW+7x+Z0WYrysO3nmjpbni2+cVoJtz0J/FMON8AijIlmkcb27agruEPHA
dQIDAQAB
-----END PUBLIC KEY-----`;

const TOOL_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQClyFTw9cZ8MdoC
sLJGtCPenwCsjR+mnKQXo0x8u0UXFNLoiVBuR90tKEz3qt2dyY91InfU515n6Rt5
o8spcJCg5loTP0M7mYHdiq+0s8x++bt0q1bunJieimjfgna4eIxi5srr8vyFNPU6
fRHh+291jkoANsHKOnhfcLYrK5vCJGDu6zfwFC+/La2xmyqoTcA2a0SI+31TWEy3
pd15ce3Cu3CMHdoF1kawfvk5q8W09Jcm8tk3DbET3LvaTuyzuPPyr9FQlt0WGNlk
JWPWcVMyF1BZqPScNxu0YPJK0QScOT4Th/KK1MjiOY5KVFub93FpOquJIXbGQgGV
UNRWKMbPAgMBAAECggEAC1wk5elEucuFgtwUyBK3LbdIVoqWrQlCyhPe8K65PatB
oImR2o/pSgGrwU55QFyvDEaMxSjT9HVDjekS/NRbAYuHVJZOYLRUjJfHEbALk6lz
log/I4g7gdgK9txIjyKp8mtm/RZ500iDtu3nEczAhuLb+a1geuw/ko3b2pPZNbGO
nAB6LW+Q3DNbtQdBTwGe9ywm9yMOzztiJ27z1FPySUdve5olL63eu1yQmM52cPR2
dLkLauF9YQfGWyeTPu4qSlplnPIluITsMwr0sFHW/u7p49MTytJEJzIguxh+O1O1
pHt0AJlYUru1Wz/UO14KfsyqeNovzU+uiOnx13+bwQKBgQDWzWyf/tQyty5OiLc9
xU38khyU9boKlmqxJygjSDews0CMJ8XhQWNw/FQA7sf1uxb6rUoA1pOUdurCZxHk
VZARMKkeGTTWZ9g3UMbgRM+gw6sY+a3B7zaDSM3fxTWRK6gsEceduKmn6EnAb3+7
V6x/CAEz5XG/1Ww3Bt/ab1FS8QKBgQDFlBT2sLwD7kl76f4g7d5K0EB44/lZzHfe
lDxrFkPqz8OKxBDItd0GHGnzrT5hQlM2e2AZKX6uITNQl7nOYDkBdzf6PKnzpgHL
glmUx7veB9dFbLIAhEwPhhmnq2lwQfZe6FsKDLdPQqDVx+2ratAYtTrarITU//Wn
lutP91A1vwKBgCr/njH88f9g+e0QoxXDbFQV75DGC8LYz2y8+OTvLO67Qz2LLKpl
y4EvkaVKJ08Cb5womjrGuW4ry9y0gzlhA2Ddi80RoKkWyopwKg901tdIs/Rg7q52
s0PejA+yS4HO6nA/8uSYtaV9812JNFmNOGOJd6wqzvVmxK3TO3ZfeDkRAoGAeXe/
p6YiAPynOsIxlUcICdCcQnZNnzKAY1uZBXEL0jlnC1Hcy7hbKN2hGclhd2PSSsVw
4CdNlXod1SdieQlZIpiL1pEjHwLpSZdawYhF7Iu/ghQAHyc2p7iW3ykXyocTE2gg
SD5nGBhrTuL6MA+b3gTVKQk1JMoz2ZOEGYZ/TnsCgYBIu7U+0mHICJkl3hYFPAFs
tC0pzxpeN6u1G4FsSggFfEJNNoCfg1ylWjuweKBuJgoxI0z9dtuSnGhL5ZuWGTV9
S4MIwdSoMenNmyYk677gPqKuC2uWZOrnFEawau+KG1B2SjxVAO4HRpUF9l74obpP
yTwgk3HAfDLIkoYACd9SMg==
-----END PRIVATE KEY-----`;

const TOOL_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEApchU8PXGfDHaArCyRrQj
3p8ArI0fppykF6NMfLtFFxTS6IlQbkfdLShM96rdncmPdSJ31OdeZ+kbeaPLKXCQ
oOZaEz9DO5mB3YqvtLPMfvm7dKtW7pyYnopo34J2uHiMYubK6/L8hTT1On0R4ftv
dY5KADbByjp4X3C2KyubwiRg7us38BQvvy2tsZsqqE3ANmtEiPt9U1hMt6XdeXHt
wrtwjB3aBdZGsH75OavFtPSXJvLZNw2xE9y72k7ss7jz8q/RUJbdFhjZZCVj1nFT
MhdQWaj0nDcbtGDyStEEnDk+E4fyitTI4jmOSlRbm/dxaTqriSF2xkIBlVDUVijG
zwIDAQAB
-----END PUBLIC KEY-----`;

const CLAIMS = {
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

const SCOPES = {
  contextMembershipReadonly:
    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  lineItem: 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  lineItemReadonly:
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
} as const;

const ALLOWED_SCOPES = new Set<string>([
  SCOPES.contextMembershipReadonly,
  SCOPES.lineItem,
  SCOPES.lineItemReadonly,
  SCOPES.score,
]);
const PLATFORM_KEY_ID = 'mock-platform-rs256-2026';
const TOOL_KEY_ID = 'mock-yawp-tool-rs256-2026';
const NOW_SECONDS = 1_784_678_400;

type FailureKind =
  'jwks' | 'tool-jwks' | 'token' | 'nrps' | 'deep-link' | 'ags';
type Failure = {
  status: number;
  body?: string;
  bodyChunks?: string[];
  contentType?: string;
  headers?: Record<string, string>;
  delayMs?: number;
  headersFirstDelayMs?: number;
  chunkDelayMs?: number;
  destroyAfterChunks?: number;
};

type TokenGrant = {
  scopes: Set<string>;
  clientId: string;
  deploymentId: string;
  expiresAt: number;
};

export type MockLtiJournalEntry = {
  method: string;
  path: string;
  queryKeys: string[];
  bodyFields: Record<string, string>;
  secretsRedacted: boolean;
};

type MockState = {
  deepLinkContentItems: unknown[];
  lineItems: Map<string, Record<string, unknown>>;
  scores: Array<Record<string, unknown>>;
};

export type MockLtiPlatform = {
  baseUrl: string;
  registration: LtiRegistration;
  alternateRegistration: LtiRegistration;
  seed: typeof MOCK_LTI_SEED;
  tool: {
    keyId: string;
    privateKeyPem: string;
    publicKeyPem: string;
    launchRequests: Array<{
      path: string;
      contentType: string;
      idToken: string;
      state: string;
    }>;
    jwksRequests: Array<{ method: string; path: string }>;
  };
  journal: MockLtiJournalEntry[];
  state: MockState;
  failNext: (kind: FailureKind, failure: Failure) => void;
  advanceTime: (seconds: number) => void;
  close: () => Promise<void>;
};

export type MockHttpCaptureServer = {
  baseUrl: string;
  requests: Array<{
    method: string;
    path: string;
    headers: Record<string, string | string[] | undefined>;
    body: string;
  }>;
  close: () => Promise<void>;
};

export const MOCK_LTI_SEED = {
  nowSeconds: NOW_SECONDS,
  clientId: 'yawp-summer-client',
  deploymentId: 'deployment-blackboard-001',
  alternateClientId: 'yawp-summer-client-alt',
  alternateDeploymentId: 'deployment-blackboard-002',
  context: {
    id: 'course-eng-101',
    label: 'ENG-101',
    title: 'English Composition I',
  },
  resourceLink: {
    id: 'resource-argument-essay-001',
    title: 'Argument Essay',
  },
  members: [
    {
      status: 'Active',
      name: 'Kevin Instructor',
      given_name: 'Kevin',
      family_name: 'Instructor',
      email: 'kevin.instructor@example.test',
      user_id: 'lti-instructor-kevin',
      lis_person_sourcedid: 'sis-instructor-001',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
    },
    {
      status: 'Active',
      user_id: 'lti-learner-ada',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    },
    {
      status: 'Active',
      name: 'James Learner',
      given_name: 'James',
      family_name: 'Learner',
      email: 'james.learner@example.test',
      user_id: 'lti-learner-james',
      lis_person_sourcedid: 'sis-learner-002',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    },
    {
      status: 'Inactive',
      name: 'Inactive Learner',
      user_id: 'lti-learner-inactive',
      roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
    },
  ],
  contentItem: {
    type: 'ltiResourceLink',
    title: 'Yawp Argument Essay',
    url: 'https://app.yawp.school/lti/launch',
    custom: { yawp_assignment_kind: 'argument-essay' },
    lineItem: {
      scoreMaximum: 100,
      label: 'Yawp Argument Essay',
      resourceId: 'resource-argument-essay-001',
      tag: 'yawp-argument-essay',
    },
  },
} as const;

function json(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
) {
  response.writeHead(status, {
    'content-type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function text(
  response: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain'
) {
  response.writeHead(status, { 'content-type': contentType });
  response.end(body);
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function b64(value: string | Uint8Array) {
  return Buffer.from(value).toString('base64url');
}

function signJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {}
) {
  const encodedHeader = b64(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
      kid: PLATFORM_KEY_ID,
      ...header,
    })
  );
  const encodedPayload = b64(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(input);
  signer.end();
  return `${input}.${b64(signer.sign(createPrivateKey(PLATFORM_PRIVATE_KEY)))}`;
}

function fetchToolJwks(toolJwksUrl: string) {
  return new Promise<{ keys?: Array<Record<string, unknown>> }>(
    (resolve, reject) => {
      const request = requestHttp(
        toolJwksUrl,
        {
          method: 'GET',
          headers: { accept: 'application/json' },
        },
        (response) => {
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 1024 * 1024) {
              response.destroy(new Error('tool jwks response too large'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('error', reject);
          response.on('end', () => {
            if (
              response.statusCode === undefined ||
              response.statusCode < 200 ||
              response.statusCode >= 300
            ) {
              reject(new Error('tool jwks unavailable'));
              return;
            }
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch {
              reject(new Error('invalid tool jwks response'));
            }
          });
        }
      );
      request.setTimeout(2_000, () => {
        request.destroy(new Error('tool jwks request timed out'));
      });
      request.on('error', reject);
      request.end();
    }
  );
}

async function decodeAndVerifyToolJwt(
  jwt: string,
  expectedAudience: string,
  toolJwksUrl: string,
  options: {
    requireSubject: boolean;
    requireJti: boolean;
    requireAudienceArray: boolean;
    expectedClientId: string;
    expectedDeploymentId: string;
    nowSeconds: number;
  }
) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('invalid assertion');
  const header = JSON.parse(
    Buffer.from(parts[0], 'base64url').toString('utf8')
  );
  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8')
  );
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') {
    throw new Error('invalid assertion key');
  }
  const jwks = await fetchToolJwks(toolJwksUrl);
  const signingJwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!signingJwk || signingJwk.kty !== 'RSA' || signingJwk.alg !== 'RS256') {
    throw new Error('invalid assertion key');
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (
    !verifier.verify(
      createPublicKey({ key: signingJwk as JsonWebKey, format: 'jwk' }),
      Buffer.from(parts[2], 'base64url')
    )
  ) {
    throw new Error('invalid assertion signature');
  }
  const audiences =
    typeof payload.aud === 'string'
      ? [payload.aud]
      : Array.isArray(payload.aud) &&
          payload.aud.every((audience: unknown) => typeof audience === 'string')
        ? payload.aud
        : [];
  const invalidNotBefore =
    payload.nbf !== undefined &&
    (typeof payload.nbf !== 'number' ||
      !Number.isFinite(payload.nbf) ||
      payload.nbf > options.nowSeconds + 60 ||
      (typeof payload.exp === 'number' && payload.nbf >= payload.exp));
  if (
    payload.iss !== options.expectedClientId ||
    (options.requireSubject && payload.sub !== options.expectedClientId) ||
    audiences.length !== 1 ||
    audiences[0] !== expectedAudience ||
    (options.requireAudienceArray && !Array.isArray(payload.aud)) ||
    (options.requireSubject &&
      payload[CLAIMS.deploymentId] !== options.expectedDeploymentId) ||
    typeof payload.iat !== 'number' ||
    !Number.isFinite(payload.iat) ||
    typeof payload.exp !== 'number' ||
    !Number.isFinite(payload.exp) ||
    payload.iat < options.nowSeconds - 300 ||
    payload.iat > options.nowSeconds + 60 ||
    payload.exp <= options.nowSeconds ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > 300 ||
    invalidNotBefore ||
    (options.requireJti &&
      (typeof payload.jti !== 'string' || payload.jti.length === 0))
  ) {
    throw new Error('invalid assertion claims');
  }
  return payload as Record<string, unknown>;
}

function accessTokenFor(scope: string, assertionId: string) {
  return `mock-access-${createHash('sha256').update(`${scope}:${assertionId}`).digest('hex').slice(0, 20)}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function journalEntry(
  request: IncomingMessage,
  url: URL,
  bodyFields: Record<string, string> = {}
): MockLtiJournalEntry {
  return {
    method: request.method ?? 'GET',
    path: url.pathname,
    queryKeys: [...url.searchParams.keys()].sort(),
    bodyFields,
    secretsRedacted: Boolean(
      request.headers.authorization || request.headers['content-type']
    ),
  };
}

async function consumeFailure(
  failures: Map<FailureKind, Failure>,
  kind: FailureKind,
  response: ServerResponse
) {
  const failure = failures.get(kind);
  if (!failure) return false;
  failures.delete(kind);
  if (failure.delayMs) {
    await new Promise((resolve) => setTimeout(resolve, failure.delayMs));
  }
  response.writeHead(failure.status, {
    'content-type': failure.contentType ?? 'text/plain',
    ...failure.headers,
  });
  response.flushHeaders();
  if (failure.headersFirstDelayMs) {
    await new Promise((resolve) =>
      setTimeout(resolve, failure.headersFirstDelayMs)
    );
  }
  if (failure.bodyChunks) {
    for (const [index, chunk] of failure.bodyChunks.entries()) {
      response.write(chunk);
      if (failure.chunkDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, failure.chunkDelayMs)
        );
      }
      if (failure.destroyAfterChunks === index + 1) {
        response.destroy();
        return true;
      }
    }
    response.end();
  } else {
    response.end(failure.body ?? '');
  }
  return true;
}

function bearerGrant(
  request: IncomingMessage,
  tokens: Map<string, TokenGrant>,
  nowSeconds: number
) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  const grant = tokens.get(authorization.slice('Bearer '.length));
  return grant && grant.expiresAt > nowSeconds ? grant : null;
}

function requireScope(
  request: IncomingMessage,
  response: ServerResponse,
  tokens: Map<string, TokenGrant>,
  nowSeconds: number,
  requiredScopes: string | string[],
  expectedRegistration: { clientId: string; deploymentId: string } = {
    clientId: MOCK_LTI_SEED.clientId,
    deploymentId: MOCK_LTI_SEED.deploymentId,
  }
) {
  const grant = bearerGrant(request, tokens, nowSeconds);
  if (
    !grant ||
    grant.clientId !== expectedRegistration.clientId ||
    grant.deploymentId !== expectedRegistration.deploymentId
  ) {
    json(response, 401, { error: 'invalid_token' });
    return false;
  }
  const candidates = Array.isArray(requiredScopes)
    ? requiredScopes
    : [requiredScopes];
  if (!candidates.some((scope) => grant.scopes.has(scope))) {
    json(response, 403, { error: 'insufficient_scope' });
    return false;
  }
  return true;
}

const LINE_ITEM_KEYS = new Set([
  'id',
  'scoreMaximum',
  'label',
  'resourceId',
  'resourceLinkId',
  'tag',
  'startDateTime',
  'endDateTime',
  'gradesReleased',
]);
const DEEP_LINK_ITEM_KEYS = new Set([
  'type',
  'url',
  'title',
  'text',
  'icon',
  'thumbnail',
  'window',
  'iframe',
  'custom',
  'lineItem',
  'available',
  'submission',
]);
const DEEP_LINK_LINE_ITEM_KEYS = new Set([
  'scoreMaximum',
  'label',
  'resourceId',
  'tag',
  'gradesReleased',
]);
const SCORE_KEYS = new Set([
  'userId',
  'scoreGiven',
  'scoreMaximum',
  'activityProgress',
  'gradingProgress',
  'timestamp',
  'comment',
  'scoringUserId',
  'submission',
]);
const ACTIVITY_PROGRESS = new Set([
  'Initialized',
  'Started',
  'InProgress',
  'Submitted',
  'Completed',
]);
const GRADING_PROGRESS = new Set([
  'NotReady',
  'Failed',
  'Pending',
  'PendingManual',
  'FullyGraded',
]);

function hasOnlyQualifiedExtensions(
  value: Record<string, unknown>,
  standardKeys: Set<string>
) {
  return Object.keys(value).every((key) => {
    if (standardKeys.has(key)) return true;
    try {
      new URL(key);
      return true;
    } catch {
      return false;
    }
  });
}

function isIsoDate(value: unknown) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::\d{2})?)$/.test(
      value
    ) &&
    hasValidIsoDateTimeFields(value)
  );
}

function isAgsTimestamp(value: unknown) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+(?:Z|[+-]\d{2}(?::\d{2})?)$/.test(
      value
    ) &&
    hasValidIsoDateTimeFields(value)
  );
}

function hasValidIsoDateTimeFields(value: string) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2})(?::(\d{2}))?)$/.exec(
      value
    );
  if (!match) return false;
  const [year, month, day, hour, minute, second, offsetHour, offsetMinute] =
    match.slice(1).map((part) => (part === undefined ? 0 : Number(part)));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth[month - 1] &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  );
}

function parseIsoDate(value: unknown) {
  return Date.parse(String(value).replace(/([+-]\d{2})$/, '$1:00'));
}

function isLineItem(value: unknown, options: { allowId: boolean }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    typeof item.label !== 'string' ||
    !item.label ||
    typeof item.scoreMaximum !== 'number' ||
    item.scoreMaximum <= 0 ||
    (!options.allowId && 'id' in item) ||
    (options.allowId &&
      (typeof item.id !== 'string' || !URL.canParse(item.id))) ||
    (item.resourceId !== undefined &&
      item.resourceId !== null &&
      typeof item.resourceId !== 'string') ||
    (item.resourceLinkId !== undefined &&
      item.resourceLinkId !== null &&
      typeof item.resourceLinkId !== 'string') ||
    (item.tag !== undefined &&
      item.tag !== null &&
      typeof item.tag !== 'string') ||
    (item.startDateTime !== undefined &&
      item.startDateTime !== null &&
      item.startDateTime !== '' &&
      !isIsoDate(item.startDateTime)) ||
    (item.endDateTime !== undefined &&
      item.endDateTime !== null &&
      item.endDateTime !== '' &&
      !isIsoDate(item.endDateTime)) ||
    (item.gradesReleased !== undefined &&
      item.gradesReleased !== null &&
      typeof item.gradesReleased !== 'boolean') ||
    !hasOnlyQualifiedExtensions(item, LINE_ITEM_KEYS)
  ) {
    return false;
  }
  return true;
}

function isOptionalPositiveInteger(value: unknown) {
  return value === undefined || (Number.isInteger(value) && Number(value) > 0);
}

function isHttpsUrl(value: unknown) {
  return (
    typeof value === 'string' &&
    URL.canParse(value) &&
    new URL(value).protocol === 'https:'
  );
}

function isDeepLinkImage(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const image = value as Record<string, unknown>;
  return (
    Object.keys(image).every((key) =>
      ['url', 'width', 'height'].includes(key)
    ) &&
    isHttpsUrl(image.url) &&
    isOptionalPositiveInteger(image.width) &&
    isOptionalPositiveInteger(image.height)
  );
}

function isDeepLinkTimePeriod(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const period = value as Record<string, unknown>;
  return (
    Object.keys(period).every((key) =>
      ['startDateTime', 'endDateTime'].includes(key)
    ) &&
    (period.startDateTime === undefined || isIsoDate(period.startDateTime)) &&
    (period.endDateTime === undefined || isIsoDate(period.endDateTime))
  );
}

function isDeepLinkLineItem(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.scoreMaximum === 'number' &&
    item.scoreMaximum > 0 &&
    (item.label === undefined ||
      (typeof item.label === 'string' && item.label.length > 0)) &&
    (item.resourceId === undefined ||
      (typeof item.resourceId === 'string' && item.resourceId.length > 0)) &&
    (item.tag === undefined ||
      (typeof item.tag === 'string' && item.tag.length > 0)) &&
    (item.gradesReleased === undefined ||
      typeof item.gradesReleased === 'boolean') &&
    hasOnlyQualifiedExtensions(item, DEEP_LINK_LINE_ITEM_KEYS)
  );
}

function isDeepLinkContentItem(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (
    item.type !== 'ltiResourceLink' ||
    (item.title !== undefined &&
      (typeof item.title !== 'string' || !item.title)) ||
    (item.url !== undefined && !isHttpsUrl(item.url)) ||
    (item.text !== undefined && typeof item.text !== 'string') ||
    (item.icon !== undefined && !isDeepLinkImage(item.icon)) ||
    (item.thumbnail !== undefined && !isDeepLinkImage(item.thumbnail)) ||
    (item.window !== undefined &&
      (!item.window ||
        typeof item.window !== 'object' ||
        Array.isArray(item.window) ||
        !Object.keys(item.window).every((key) =>
          ['targetName', 'width', 'height', 'windowFeatures'].includes(key)
        ) ||
        ((item.window as Record<string, unknown>).targetName !== undefined &&
          typeof (item.window as Record<string, unknown>).targetName !==
            'string') ||
        ((item.window as Record<string, unknown>).windowFeatures !==
          undefined &&
          typeof (item.window as Record<string, unknown>).windowFeatures !==
            'string') ||
        !isOptionalPositiveInteger(
          (item.window as Record<string, unknown>).width
        ) ||
        !isOptionalPositiveInteger(
          (item.window as Record<string, unknown>).height
        ))) ||
    (item.iframe !== undefined &&
      (!item.iframe ||
        typeof item.iframe !== 'object' ||
        Array.isArray(item.iframe) ||
        !Object.keys(item.iframe).every((key) =>
          ['width', 'height'].includes(key)
        ) ||
        !isOptionalPositiveInteger(
          (item.iframe as Record<string, unknown>).width
        ) ||
        !isOptionalPositiveInteger(
          (item.iframe as Record<string, unknown>).height
        ))) ||
    (item.custom !== undefined &&
      (!item.custom ||
        typeof item.custom !== 'object' ||
        Array.isArray(item.custom) ||
        Object.values(item.custom).some(
          (entry) => typeof entry !== 'string'
        ))) ||
    (item.available !== undefined && !isDeepLinkTimePeriod(item.available)) ||
    (item.submission !== undefined && !isDeepLinkTimePeriod(item.submission)) ||
    !hasOnlyQualifiedExtensions(item, DEEP_LINK_ITEM_KEYS)
  ) {
    return false;
  }
  if (item.lineItem !== undefined && !isDeepLinkLineItem(item.lineItem)) {
    return false;
  }
  return true;
}

function isScore(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const score = value as Record<string, unknown>;
  if (
    typeof score.userId !== 'string' ||
    !score.userId ||
    !ACTIVITY_PROGRESS.has(String(score.activityProgress)) ||
    !GRADING_PROGRESS.has(String(score.gradingProgress)) ||
    !isAgsTimestamp(score.timestamp) ||
    (score.scoreGiven !== undefined &&
      score.scoreGiven !== null &&
      (typeof score.scoreGiven !== 'number' || score.scoreGiven < 0)) ||
    (typeof score.scoreGiven === 'number' &&
      (typeof score.scoreMaximum !== 'number' || score.scoreMaximum <= 0)) ||
    (score.scoreMaximum !== undefined &&
      (typeof score.scoreMaximum !== 'number' || score.scoreMaximum <= 0)) ||
    (score.comment !== undefined &&
      score.comment !== null &&
      typeof score.comment !== 'string') ||
    (score.scoringUserId !== undefined &&
      (typeof score.scoringUserId !== 'string' || !score.scoringUserId)) ||
    (score.submission !== undefined &&
      (!score.submission ||
        typeof score.submission !== 'object' ||
        Array.isArray(score.submission) ||
        !Object.keys(score.submission).every((key) =>
          ['startedAt', 'submittedAt'].includes(key)
        ) ||
        ((score.submission as Record<string, unknown>).startedAt !==
          undefined &&
          !isAgsTimestamp(
            (score.submission as Record<string, unknown>).startedAt
          )) ||
        ((score.submission as Record<string, unknown>).submittedAt !==
          undefined &&
          !isAgsTimestamp(
            (score.submission as Record<string, unknown>).submittedAt
          )) ||
        (typeof (score.submission as Record<string, unknown>).startedAt ===
          'string' &&
          typeof (score.submission as Record<string, unknown>).submittedAt ===
            'string' &&
          parseIsoDate(
            (score.submission as Record<string, unknown>).submittedAt
          ) <
            parseIsoDate(
              (score.submission as Record<string, unknown>).startedAt
            )))) ||
    !hasOnlyQualifiedExtensions(score, SCORE_KEYS)
  ) {
    return false;
  }
  return true;
}

export async function startMockLtiPlatform(): Promise<MockLtiPlatform> {
  const journal: MockLtiJournalEntry[] = [];
  const failures = new Map<FailureKind, Failure>();
  const tokens = new Map<string, TokenGrant>();
  const usedAssertions = new Set<string>();
  const usedDeepLinkNonces = new Set<string>();
  const pendingDeepLinkData: Array<string | null> = [];
  const deepLinkCapabilities = {
    acceptTypes: ['ltiResourceLink'],
    documentTargets: ['iframe', 'window'],
    acceptsMultiple: true,
    acceptLineItem: true,
  } as const;
  const launchRequests: MockLtiPlatform['tool']['launchRequests'] = [];
  const toolJwksRequests: MockLtiPlatform['tool']['jwksRequests'] = [];
  const state: MockState = {
    deepLinkContentItems: [],
    lineItems: new Map(),
    scores: [],
  };
  let baseUrl = '';
  let nowSeconds = NOW_SECONDS;

  const toolServer = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (
        request.method === 'GET' &&
        url.pathname === '/.well-known/jwks.json'
      ) {
        toolJwksRequests.push({ method: 'GET', path: url.pathname });
        if (await consumeFailure(failures, 'tool-jwks', response)) return;
        const jwk = createPublicKey(TOOL_PUBLIC_KEY).export({ format: 'jwk' });
        json(response, 200, {
          keys: [{ ...jwk, kid: TOOL_KEY_ID, use: 'sig', alg: 'RS256' }],
        });
        return;
      }
      if (
        request.method !== 'POST' ||
        !['/lti/launch', '/lti/deep-link'].includes(url.pathname) ||
        !request.headers['content-type']?.includes(
          'application/x-www-form-urlencoded'
        )
      ) {
        json(response, 400, { error: 'invalid_tool_callback' });
        return;
      }
      const form = new URLSearchParams(await readBody(request));
      const idToken = form.get('id_token') ?? '';
      const stateValue = form.get('state') ?? '';
      if (!idToken || !stateValue) {
        json(response, 400, { error: 'missing_form_fields' });
        return;
      }
      launchRequests.push({
        path: url.pathname,
        contentType: String(request.headers['content-type']),
        idToken,
        state: stateValue,
      });
      json(response, 200, { idToken, state: stateValue });
    })();
  });
  toolServer.listen(0, '127.0.0.1');
  await once(toolServer, 'listening');
  const toolAddress = toolServer.address() as AddressInfo;
  const toolBaseUrl = `http://127.0.0.1:${toolAddress.port}`;

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? '/', baseUrl || 'http://127.0.0.1');
      const body = ['POST', 'PUT'].includes(request.method ?? '')
        ? await readBody(request)
        : '';
      const form =
        request.headers['content-type']?.includes(
          'application/x-www-form-urlencoded'
        ) && body
          ? new URLSearchParams(body)
          : null;
      const safeBodyFields = form
        ? Object.fromEntries(
            [...form.entries()].filter(
              ([key]) =>
                !['client_assertion', 'id_token', 'jwt'].includes(
                  key.toLowerCase()
                )
            )
          )
        : {};
      journal.push(journalEntry(request, url, safeBodyFields));

      if (
        request.method === 'GET' &&
        url.pathname === '/.well-known/jwks.json'
      ) {
        if (await consumeFailure(failures, 'jwks', response)) return;
        const jwk = createPublicKey(PLATFORM_PUBLIC_KEY).export({
          format: 'jwk',
        });
        json(
          response,
          200,
          {
            keys: [{ ...jwk, kid: PLATFORM_KEY_ID, use: 'sig', alg: 'RS256' }],
          },
          { 'content-type': 'application/jwk-set+json' }
        );
        return;
      }

      if (request.method === 'GET' && url.pathname === '/oidc/auth') {
        for (const [key, expected] of [
          ['scope', 'openid'],
          ['response_type', 'id_token'],
          ['response_mode', 'form_post'],
          ['prompt', 'none'],
          ['client_id', MOCK_LTI_SEED.clientId],
        ]) {
          if (url.searchParams.get(key) !== expected) {
            json(response, 400, { error: `invalid_${key}` });
            return;
          }
        }
        const scenario =
          url.searchParams.get('lti_message_hint') ??
          'instructor-resource-link';
        const targetLinkUri = url.searchParams.get('redirect_uri') ?? '';
        const learner = scenario === 'learner-resource-link-no-pii';
        const deepLink = scenario.startsWith('deep-link');
        const expectedTarget = deepLink
          ? `${toolBaseUrl}/lti/deep-link`
          : `${toolBaseUrl}/lti/launch`;
        if (targetLinkUri !== expectedTarget) {
          json(response, 400, { error: 'invalid_redirect_uri' });
          return;
        }
        const payload: Record<string, unknown> = {
          iss: baseUrl,
          aud: MOCK_LTI_SEED.clientId,
          sub: learner ? 'lti-learner-ada' : 'lti-instructor-kevin',
          iat: nowSeconds,
          exp: nowSeconds + 300,
          nonce: url.searchParams.get('nonce'),
          [CLAIMS.deploymentId]: MOCK_LTI_SEED.deploymentId,
          [CLAIMS.messageType]: deepLink
            ? 'LtiDeepLinkingRequest'
            : 'LtiResourceLinkRequest',
          [CLAIMS.version]: '1.3.0',
          [CLAIMS.targetLinkUri]: targetLinkUri,
          [CLAIMS.roles]: [
            learner
              ? 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'
              : 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
          ],
          [CLAIMS.context]: MOCK_LTI_SEED.context,
          [CLAIMS.custom]: { yawp_assignment_kind: 'argument-essay' },
          [CLAIMS.namesRoleService]: {
            context_memberships_url: `${baseUrl}/contexts/course-eng-101/memberships`,
            service_versions: ['2.0'],
          },
          [CLAIMS.endpoint]: {
            scope: [SCOPES.lineItem, SCOPES.score],
            lineitems: `${baseUrl}/contexts/course-eng-101/lineitems`,
          },
        };
        if (!deepLink)
          payload[CLAIMS.resourceLink] = MOCK_LTI_SEED.resourceLink;
        if (deepLink) {
          const settings: Record<string, unknown> = {
            deep_link_return_url: `${baseUrl}/deep-link/return`,
            accept_types: [...deepLinkCapabilities.acceptTypes],
            accept_presentation_document_targets: [
              ...deepLinkCapabilities.documentTargets,
            ],
            accept_multiple: deepLinkCapabilities.acceptsMultiple,
            auto_create: false,
            accept_lineitem: deepLinkCapabilities.acceptLineItem,
          };
          if (scenario === 'deep-link-no-target') {
            settings.accept_presentation_document_targets = [];
          }
          if (scenario === 'deep-link-empty-data') {
            settings.data = '';
          } else if (scenario !== 'deep-link-no-data') {
            settings.data = 'opaque-deep-link-data-001';
          }
          payload[CLAIMS.deepLinkingSettings] = settings;
          pendingDeepLinkData.push(
            typeof settings.data === 'string' ? settings.data : null
          );
        }
        if (scenario === 'deep-link-minimal') {
          delete payload.sub;
          delete payload[CLAIMS.roles];
          delete payload[CLAIMS.context];
        }
        if (scenario === 'anonymous-resource-link-no-context') {
          delete payload.sub;
          delete payload[CLAIMS.context];
          delete payload[CLAIMS.namesRoleService];
          delete payload[CLAIMS.endpoint];
        }
        if (!learner && scenario !== 'anonymous-resource-link-no-context') {
          Object.assign(payload, {
            email: 'kevin.instructor@example.test',
            given_name: 'Kevin',
            family_name: 'Instructor',
            name: 'Kevin Instructor',
          });
        }

        if (scenario === 'wrong-deployment') {
          payload[CLAIMS.deploymentId] = 'deployment-attacker-999';
        } else if (scenario === 'wrong-audience') {
          payload.aud = 'other-client';
        } else if (scenario === 'wrong-nonce') {
          payload.nonce = 'attacker-nonce';
        } else if (scenario === 'expired') {
          payload.exp = nowSeconds - 1;
        } else if (scenario === 'future-issued-at') {
          payload.iat = nowSeconds + 600;
        } else if (scenario === 'stale-issued-at') {
          payload.iat = nowSeconds - 301;
        } else if (scenario === 'excessive-lifetime') {
          payload.exp = nowSeconds + 601;
        } else if (scenario === 'future-not-before') {
          payload.nbf = nowSeconds + 600;
        } else if (scenario === 'expiry-before-issued-at') {
          payload.iat = nowSeconds + 30;
          payload.exp = nowSeconds + 20;
        } else if (scenario === 'not-before-after-expiry') {
          payload.nbf = nowSeconds + 50;
          payload.exp = nowSeconds + 40;
        } else if (scenario === 'untrusted-additional-audience') {
          payload.aud = [MOCK_LTI_SEED.clientId, 'attacker-client'];
          payload.azp = MOCK_LTI_SEED.clientId;
        } else if (scenario === 'wrong-authorized-party') {
          payload.azp = 'attacker-client';
        } else if (scenario === 'empty-roles') {
          payload[CLAIMS.roles] = [];
        } else if (scenario === 'wrong-target') {
          payload[CLAIMS.targetLinkUri] = 'https://attacker.example/launch';
        } else if (scenario === 'untrusted-service-origin') {
          payload[CLAIMS.namesRoleService] = {
            context_memberships_url: 'https://other-tenant.example/memberships',
            service_versions: ['2.0'],
          };
        }

        let idToken: string;
        if (scenario === 'alg-none') {
          const header = b64(
            JSON.stringify({ alg: 'none', typ: 'JWT', kid: PLATFORM_KEY_ID })
          );
          idToken = `${header}.${b64(JSON.stringify(payload))}.unsigned`;
        } else {
          idToken = signJwt(
            payload,
            scenario === 'jku-header'
              ? { jku: 'https://attacker.example/jwks' }
              : scenario === 'unknown-kid'
                ? { kid: 'unknown-platform-key' }
                : {}
          );
        }
        const stateValue = url.searchParams.get('state') ?? '';
        text(
          response,
          200,
          `<!doctype html><html><body><form method="post" action="${escapeHtml(targetLinkUri)}"><input type="hidden" name="id_token" value="${escapeHtml(idToken)}"><input type="hidden" name="state" value="${escapeHtml(stateValue)}"></form></body></html>`,
          'text/html; charset=utf-8'
        );
        return;
      }

      if (
        request.method === 'POST' &&
        ['/oauth2/token', '/oauth2/token/alternate'].includes(url.pathname)
      ) {
        if (await consumeFailure(failures, 'token', response)) return;
        const alternate = url.pathname.endsWith('/alternate');
        const expectedClientId = alternate
          ? MOCK_LTI_SEED.alternateClientId
          : MOCK_LTI_SEED.clientId;
        const expectedDeploymentId = alternate
          ? MOCK_LTI_SEED.alternateDeploymentId
          : MOCK_LTI_SEED.deploymentId;
        if (
          !form ||
          form.get('grant_type') !== 'client_credentials' ||
          form.get('client_assertion_type') !==
            'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
        ) {
          json(response, 400, { error: 'invalid_request' });
          return;
        }
        const assertion = form.get('client_assertion') ?? '';
        const scope = form.get('scope') ?? '';
        const requestedScopes = scope.split(' ').filter(Boolean);
        if (
          requestedScopes.length === 0 ||
          requestedScopes.some((candidate) => !ALLOWED_SCOPES.has(candidate))
        ) {
          json(response, 400, { error: 'invalid_scope' });
          return;
        }
        try {
          const claims = await decodeAndVerifyToolJwt(
            assertion,
            `${baseUrl}${url.pathname}`,
            `${toolBaseUrl}/.well-known/jwks.json`,
            {
              requireSubject: true,
              requireJti: true,
              requireAudienceArray: true,
              expectedClientId,
              expectedDeploymentId,
              nowSeconds,
            }
          );
          const jti = String(claims.jti);
          if (usedAssertions.has(jti)) throw new Error('assertion replay');
          usedAssertions.add(jti);
        } catch {
          json(response, 401, { error: 'invalid_client' });
          return;
        }
        const assertionId = String(
          JSON.parse(
            Buffer.from(assertion.split('.')[1], 'base64url').toString('utf8')
          ).jti
        );
        const token = accessTokenFor(scope, assertionId);
        tokens.set(token, {
          scopes: new Set(requestedScopes),
          clientId: expectedClientId,
          deploymentId: expectedDeploymentId,
          expiresAt: nowSeconds + 300,
        });
        json(response, 200, {
          access_token: token,
          token_type: 'bearer',
          expires_in: 300,
          scope,
        });
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/contexts/course-eng-101/memberships'
      ) {
        if (await consumeFailure(failures, 'nrps', response)) return;
        if (
          request.headers.accept !==
          'application/vnd.ims.lti-nrps.v2.membershipcontainer+json'
        ) {
          json(response, 406, { error: 'not_acceptable' });
          return;
        }
        if (
          !requireScope(
            request,
            response,
            tokens,
            nowSeconds,
            SCOPES.contextMembershipReadonly
          )
        )
          return;
        const requestedRole = url.searchParams.get('role');
        const matchingMembers = requestedRole
          ? MOCK_LTI_SEED.members.filter((member) =>
              member.roles.some(
                (role) =>
                  role === requestedRole || role.endsWith(`#${requestedRole}`)
              )
            )
          : [...MOCK_LTI_SEED.members];
        const limit = Math.max(
          1,
          Math.min(Number(url.searchParams.get('limit') ?? 100), 100)
        );
        const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
        const start = (page - 1) * limit;
        const members = matchingMembers.slice(start, start + limit);
        const headers: Record<string, string> = {
          'content-type':
            'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
        };
        if (start + limit < matchingMembers.length) {
          const next = new URL(url);
          next.searchParams.set('page', String(page + 1));
          headers.link =
            url.searchParams.get('linkStyle') === 'complex'
              ? `<${next.pathname}${next.search}>; type="application/json"; rel="next alternate"`
              : `<${next.toString()}>; rel="next"`;
        }
        json(
          response,
          200,
          {
            id: url.toString(),
            context: MOCK_LTI_SEED.context,
            members,
          },
          headers
        );
        return;
      }

      if (request.method === 'POST' && url.pathname === '/deep-link/return') {
        if (await consumeFailure(failures, 'deep-link', response)) return;
        const parsed = new URLSearchParams(body);
        try {
          const claims = await decodeAndVerifyToolJwt(
            parsed.get('JWT') ?? parsed.get('id_token') ?? '',
            baseUrl,
            `${toolBaseUrl}/.well-known/jwks.json`,
            {
              requireSubject: false,
              requireJti: false,
              requireAudienceArray: false,
              expectedClientId: MOCK_LTI_SEED.clientId,
              expectedDeploymentId: MOCK_LTI_SEED.deploymentId,
              nowSeconds,
            }
          );
          const nonce = claims.nonce;
          const expectedData = pendingDeepLinkData[0];
          if (
            expectedData === undefined ||
            claims[CLAIMS.messageType] !== 'LtiDeepLinkingResponse' ||
            claims[CLAIMS.version] !== '1.3.0' ||
            claims[CLAIMS.deploymentId] !== MOCK_LTI_SEED.deploymentId ||
            typeof nonce !== 'string' ||
            !nonce ||
            usedDeepLinkNonces.has(nonce) ||
            (expectedData === null
              ? claims[CLAIMS.data] !== undefined
              : claims[CLAIMS.data] !== expectedData)
          ) {
            throw new Error('wrong message type');
          }
          const items = claims[CLAIMS.contentItems] ?? [];
          if (
            !Array.isArray(items) ||
            (items.length > 1 && !deepLinkCapabilities.acceptsMultiple) ||
            items.some((item) => {
              if (!isDeepLinkContentItem(item)) return true;
              const contentItem = item as Record<string, unknown>;
              return (
                !deepLinkCapabilities.acceptTypes.includes(
                  contentItem.type as 'ltiResourceLink'
                ) ||
                ('lineItem' in contentItem &&
                  !deepLinkCapabilities.acceptLineItem) ||
                ('window' in contentItem &&
                  !deepLinkCapabilities.documentTargets.includes('window')) ||
                ('iframe' in contentItem &&
                  !deepLinkCapabilities.documentTargets.includes('iframe'))
              );
            })
          ) {
            throw new Error('invalid content items');
          }
          pendingDeepLinkData.shift();
          usedDeepLinkNonces.add(nonce);
          state.deepLinkContentItems.push(...items);
          response.writeHead(204);
          response.end();
        } catch {
          json(response, 400, { error: 'invalid_deep_link_response' });
        }
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/contexts/course-eng-101/lineitems'
      ) {
        if (await consumeFailure(failures, 'ags', response)) return;
        if (
          !requireScope(request, response, tokens, nowSeconds, [
            SCOPES.lineItem,
            SCOPES.lineItemReadonly,
          ])
        )
          return;
        if (
          request.headers.accept !==
          'application/vnd.ims.lis.v2.lineitemcontainer+json'
        ) {
          json(response, 406, { error: 'not_acceptable' });
          return;
        }
        let matching = [...state.lineItems.values()];
        for (const [query, field] of [
          ['resource_link_id', 'resourceLinkId'],
          ['resource_id', 'resourceId'],
          ['tag', 'tag'],
        ] as const) {
          const expected = url.searchParams.get(query);
          if (expected !== null) {
            matching = matching.filter((item) => item[field] === expected);
          }
        }
        const limit = Math.max(
          1,
          Math.min(Number(url.searchParams.get('limit') ?? 100), 100)
        );
        const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
        const start = (page - 1) * limit;
        const headers: Record<string, string> = {
          'content-type': 'application/vnd.ims.lis.v2.lineitemcontainer+json',
        };
        if (start + limit < matching.length) {
          const next = new URL(url);
          next.searchParams.set('page', String(page + 1));
          headers.link = `<${next.pathname}${next.search}>; rel="next"`;
        }
        json(response, 200, matching.slice(start, start + limit), headers);
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/contexts/course-eng-101/lineitems'
      ) {
        if (await consumeFailure(failures, 'ags', response)) return;
        if (
          !requireScope(request, response, tokens, nowSeconds, SCOPES.lineItem)
        )
          return;
        if (
          request.headers['content-type'] !==
            'application/vnd.ims.lis.v2.lineitem+json' ||
          request.headers.accept !== 'application/vnd.ims.lis.v2.lineitem+json'
        ) {
          json(response, 415, { error: 'unsupported_media_type' });
          return;
        }
        try {
          const lineItem = JSON.parse(body) as Record<string, unknown>;
          if (!isLineItem(lineItem, { allowId: false })) {
            throw new Error('invalid line item');
          }
          const id = `lineitem-${String(lineItem.resourceId ?? state.lineItems.size + 1)}`;
          const stored = {
            ...lineItem,
            id: `${baseUrl}/lineitems/${id}`,
            resourceLinkId:
              lineItem.resourceLinkId ?? MOCK_LTI_SEED.resourceLink.id,
          };
          state.lineItems.set(id, stored);
          json(response, 201, stored, {
            'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
            location: `${baseUrl}/lineitems/${id}`,
          });
        } catch {
          json(response, 400, { error: 'invalid_lineitem' });
        }
        return;
      }

      const lineItemMatch = url.pathname.match(/^\/lineitems\/([^/]+)$/);
      if (lineItemMatch && ['GET', 'PUT'].includes(request.method ?? '')) {
        if (await consumeFailure(failures, 'ags', response)) return;
        if (
          !requireScope(
            request,
            response,
            tokens,
            nowSeconds,
            request.method === 'GET'
              ? [SCOPES.lineItem, SCOPES.lineItemReadonly]
              : SCOPES.lineItem
          )
        )
          return;
        const existing = state.lineItems.get(lineItemMatch[1]);
        if (!existing) {
          json(response, 404, { error: 'lineitem_not_found' });
          return;
        }
        if (request.method === 'GET') {
          if (
            request.headers.accept !==
            'application/vnd.ims.lis.v2.lineitem+json'
          ) {
            json(response, 406, { error: 'not_acceptable' });
            return;
          }
          json(response, 200, existing, {
            'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
          });
          return;
        }
        if (
          request.headers['content-type'] !==
            'application/vnd.ims.lis.v2.lineitem+json' ||
          request.headers.accept !== 'application/vnd.ims.lis.v2.lineitem+json'
        ) {
          json(response, 415, { error: 'unsupported_media_type' });
          return;
        }
        try {
          const update = JSON.parse(body) as Record<string, unknown>;
          if (
            !isLineItem(update, { allowId: false }) ||
            (update.resourceLinkId !== undefined &&
              update.resourceLinkId !== existing.resourceLinkId)
          ) {
            throw new Error('invalid update');
          }
          const stored = {
            ...update,
            id: existing.id,
            resourceLinkId: existing.resourceLinkId,
          };
          state.lineItems.set(lineItemMatch[1], stored);
          json(response, 200, stored, {
            'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
          });
        } catch {
          json(response, 400, { error: 'invalid_lineitem' });
        }
        return;
      }

      const scoreMatch = url.pathname.match(/^\/lineitems\/([^/]+)\/scores$/);
      if (request.method === 'POST' && scoreMatch) {
        if (await consumeFailure(failures, 'ags', response)) return;
        if (!requireScope(request, response, tokens, nowSeconds, SCOPES.score))
          return;
        if (!state.lineItems.has(scoreMatch[1])) {
          json(response, 404, { error: 'lineitem_not_found' });
          return;
        }
        if (
          request.headers['content-type'] !==
          'application/vnd.ims.lis.v1.score+json'
        ) {
          json(response, 415, { error: 'unsupported_media_type' });
          return;
        }
        try {
          const score = JSON.parse(body) as Record<string, unknown>;
          if (!isScore(score)) {
            throw new Error('invalid score');
          }
          const latest = [...state.scores]
            .reverse()
            .find(
              (stored) =>
                stored.lineItemId === scoreMatch[1] &&
                stored.userId === score.userId
            );
          if (
            latest &&
            parseIsoDate(score.timestamp) <= parseIsoDate(latest.timestamp)
          ) {
            throw new Error('stale score timestamp');
          }
          state.scores.push({ ...score, lineItemId: scoreMatch[1] });
        } catch {
          json(response, 400, { error: 'invalid_score' });
          return;
        }
        response.writeHead(204);
        response.end();
        return;
      }

      json(response, 404, { error: 'not_found' });
    })().catch((error: unknown) => {
      if (!response.headersSent) {
        json(response, 500, { error: 'mock_platform_error' });
      } else {
        response.end();
      }
      process.stderr.write(
        `mock LTI platform error: ${error instanceof Error ? error.message : String(error)}\n`
      );
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
  state.lineItems.set('lineitem-argument-essay-001', {
    id: `${baseUrl}/lineitems/lineitem-argument-essay-001`,
    scoreMaximum: 100,
    label: 'Yawp Argument Essay',
    resourceId: 'resource-argument-essay-001',
    resourceLinkId: MOCK_LTI_SEED.resourceLink.id,
    tag: 'yawp-argument-essay',
  });

  const registration: LtiRegistration = {
    id: 'registration-blackboard-001',
    organizationId: 'organization-ua-001',
    provider: 'blackboard',
    displayName: 'Blackboard Reference Mock',
    transportMode: 'loopback-http',
    issuer: baseUrl,
    clientId: MOCK_LTI_SEED.clientId,
    allowedAudiences: [MOCK_LTI_SEED.clientId],
    deploymentId: MOCK_LTI_SEED.deploymentId,
    authorizationEndpoint: `${baseUrl}/oidc/auth`,
    tokenEndpoint: `${baseUrl}/oauth2/token`,
    jwksUrl: `${baseUrl}/.well-known/jwks.json`,
    allowedServiceOrigins: [baseUrl],
    loginInitiationUrl: `${toolBaseUrl}/lti/login`,
    launchUrl: `${toolBaseUrl}/lti/launch`,
    deepLinkingLaunchUrl: `${toolBaseUrl}/lti/deep-link`,
    toolJwksUrl: `${toolBaseUrl}/.well-known/jwks.json`,
    allowedTargetLinkUris: [
      `${toolBaseUrl}/lti/launch`,
      `${toolBaseUrl}/lti/deep-link`,
    ],
    enabledScopes: [...ALLOWED_SCOPES],
    enabled: true,
  };
  const alternateRegistration: LtiRegistration = {
    ...registration,
    id: 'registration-blackboard-002',
    organizationId: 'organization-other-002',
    displayName: 'Blackboard Alternate Tenant Mock',
    clientId: MOCK_LTI_SEED.alternateClientId,
    allowedAudiences: [MOCK_LTI_SEED.alternateClientId],
    deploymentId: MOCK_LTI_SEED.alternateDeploymentId,
    tokenEndpoint: `${baseUrl}/oauth2/token/alternate`,
  };

  return {
    baseUrl,
    registration,
    alternateRegistration,
    seed: MOCK_LTI_SEED,
    tool: {
      keyId: TOOL_KEY_ID,
      privateKeyPem: TOOL_PRIVATE_KEY,
      publicKeyPem: TOOL_PUBLIC_KEY,
      launchRequests,
      jwksRequests: toolJwksRequests,
    },
    journal,
    state,
    failNext(kind, failure) {
      failures.set(kind, failure);
    },
    advanceTime(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error(
          'Mock LTI time can only advance by a positive duration.'
        );
      }
      nowSeconds += seconds;
    },
    async close() {
      server.close();
      toolServer.close();
      await Promise.all([once(server, 'close'), once(toolServer, 'close')]);
    },
  };
}

export async function startMockHttpCaptureServer(): Promise<MockHttpCaptureServer> {
  const requests: MockHttpCaptureServer['requests'] = [];
  const server = createServer((request, response) => {
    void (async () => {
      requests.push({
        method: request.method ?? 'GET',
        path: request.url ?? '/',
        headers: { ...request.headers },
        body: await readBody(request),
      });
      response.writeHead(204);
      response.end();
    })();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}
