import {
  createHash,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
} from 'node:crypto';
import {
  createServer,
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
  resultReadonly:
    'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  score: 'https://purl.imsglobal.org/spec/lti-ags/scope/score',
} as const;

const ALLOWED_SCOPES = new Set<string>(Object.values(SCOPES));
const PLATFORM_KEY_ID = 'mock-platform-rs256-2026';
const TOOL_KEY_ID = 'mock-yawp-tool-rs256-2026';
const NOW_SECONDS = 1_784_678_400;

type FailureKind = 'jwks' | 'token' | 'nrps' | 'deep-link' | 'ags';
type Failure = { status: number; body: string; contentType?: string };

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
  scores: Map<string, Record<string, unknown>>;
};

export type MockLtiPlatform = {
  baseUrl: string;
  registration: LtiRegistration;
  seed: typeof MOCK_LTI_SEED;
  tool: {
    keyId: string;
    privateKeyPem: string;
    publicKeyPem: string;
  };
  journal: MockLtiJournalEntry[];
  state: MockState;
  failNext: (kind: FailureKind, failure: Failure) => void;
  close: () => Promise<void>;
};

export const MOCK_LTI_SEED = {
  nowSeconds: NOW_SECONDS,
  clientId: 'yawp-summer-client',
  deploymentId: 'deployment-blackboard-001',
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

function decodeAndVerifyToolJwt(
  jwt: string,
  expectedAudience: string,
  options: { requireSubject: boolean; requireJti: boolean }
) {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error('invalid assertion');
  const header = JSON.parse(
    Buffer.from(parts[0], 'base64url').toString('utf8')
  );
  const payload = JSON.parse(
    Buffer.from(parts[1], 'base64url').toString('utf8')
  );
  if (header.alg !== 'RS256' || header.kid !== TOOL_KEY_ID) {
    throw new Error('invalid assertion key');
  }
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${parts[0]}.${parts[1]}`);
  verifier.end();
  if (
    !verifier.verify(
      createPublicKey(TOOL_PUBLIC_KEY),
      Buffer.from(parts[2], 'base64url')
    )
  ) {
    throw new Error('invalid assertion signature');
  }
  if (
    payload.iss !== MOCK_LTI_SEED.clientId ||
    (options.requireSubject && payload.sub !== MOCK_LTI_SEED.clientId) ||
    payload.aud !== expectedAudience ||
    payload.exp <= NOW_SECONDS ||
    payload.iat > NOW_SECONDS + 60 ||
    (options.requireJti && typeof payload.jti !== 'string')
  ) {
    throw new Error('invalid assertion claims');
  }
  return payload as Record<string, unknown>;
}

function accessTokenFor(scope: string) {
  return `mock-access-${createHash('sha256').update(scope).digest('hex').slice(0, 20)}`;
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

function consumeFailure(
  failures: Map<FailureKind, Failure>,
  kind: FailureKind,
  response: ServerResponse
) {
  const failure = failures.get(kind);
  if (!failure) return false;
  failures.delete(kind);
  text(
    response,
    failure.status,
    failure.body,
    failure.contentType ?? 'text/plain'
  );
  return true;
}

function bearerScopes(
  request: IncomingMessage,
  tokens: Map<string, Set<string>>
) {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return null;
  return tokens.get(authorization.slice('Bearer '.length)) ?? null;
}

function requireScope(
  request: IncomingMessage,
  response: ServerResponse,
  tokens: Map<string, Set<string>>,
  requiredScope: string
) {
  const scopes = bearerScopes(request, tokens);
  if (!scopes) {
    json(response, 401, { error: 'invalid_token' });
    return false;
  }
  if (!scopes.has(requiredScope)) {
    json(response, 403, { error: 'insufficient_scope' });
    return false;
  }
  return true;
}

export async function startMockLtiPlatform(): Promise<MockLtiPlatform> {
  const journal: MockLtiJournalEntry[] = [];
  const failures = new Map<FailureKind, Failure>();
  const tokens = new Map<string, Set<string>>();
  const usedAssertions = new Set<string>();
  const state: MockState = {
    deepLinkContentItems: [],
    lineItems: new Map([
      [
        'lineitem-argument-essay-001',
        {
          id: 'lineitem-argument-essay-001',
          scoreMaximum: 100,
          label: 'Yawp Argument Essay',
          resourceId: 'resource-argument-essay-001',
          tag: 'yawp-argument-essay',
        },
      ],
    ]),
    scores: new Map(),
  };
  let baseUrl = '';

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
        if (consumeFailure(failures, 'jwks', response)) return;
        const jwk = createPublicKey(PLATFORM_PUBLIC_KEY).export({
          format: 'jwk',
        });
        json(response, 200, {
          keys: [{ ...jwk, kid: PLATFORM_KEY_ID, use: 'sig', alg: 'RS256' }],
        });
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
        const deepLink = scenario === 'deep-link';
        const payload: Record<string, unknown> = {
          iss: baseUrl,
          aud: MOCK_LTI_SEED.clientId,
          sub: learner ? 'lti-learner-ada' : 'lti-instructor-kevin',
          iat: NOW_SECONDS,
          exp: NOW_SECONDS + 300,
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
            scope: [SCOPES.lineItem, SCOPES.resultReadonly, SCOPES.score],
            lineitems: `${baseUrl}/contexts/course-eng-101/lineitems`,
          },
        };
        if (!deepLink)
          payload[CLAIMS.resourceLink] = MOCK_LTI_SEED.resourceLink;
        if (deepLink) {
          payload[CLAIMS.deepLinkingSettings] = {
            deep_link_return_url: `${baseUrl}/deep-link/return`,
            accept_types: ['ltiResourceLink'],
            accept_presentation_document_targets: ['iframe', 'window'],
            accept_multiple: true,
            auto_create: false,
            data: 'opaque-deep-link-data-001',
          };
        }
        if (!learner) {
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
          payload.exp = NOW_SECONDS - 1;
        } else if (scenario === 'future-issued-at') {
          payload.iat = NOW_SECONDS + 600;
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

      if (request.method === 'POST' && url.pathname === '/oauth2/token') {
        if (consumeFailure(failures, 'token', response)) return;
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
          const claims = decodeAndVerifyToolJwt(
            assertion,
            `${baseUrl}/oauth2/token`,
            { requireSubject: true, requireJti: true }
          );
          const jti = String(claims.jti);
          if (usedAssertions.has(jti)) throw new Error('assertion replay');
          usedAssertions.add(jti);
        } catch {
          json(response, 401, { error: 'invalid_client' });
          return;
        }
        const token = accessTokenFor(scope);
        tokens.set(token, new Set(requestedScopes));
        json(response, 200, {
          access_token: token,
          token_type: 'Bearer',
          expires_in: 300,
          scope,
        });
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/contexts/course-eng-101/memberships'
      ) {
        if (consumeFailure(failures, 'nrps', response)) return;
        if (
          !requireScope(
            request,
            response,
            tokens,
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
          headers.link = `<${next.toString()}>; rel="next"`;
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
        if (consumeFailure(failures, 'deep-link', response)) return;
        const parsed = new URLSearchParams(body);
        try {
          const claims = decodeAndVerifyToolJwt(
            parsed.get('JWT') ?? parsed.get('id_token') ?? '',
            baseUrl,
            { requireSubject: false, requireJti: false }
          );
          if (
            claims[CLAIMS.messageType] !== 'LtiDeepLinkingResponse' ||
            claims[CLAIMS.version] !== '1.3.0' ||
            claims[CLAIMS.deploymentId] !== MOCK_LTI_SEED.deploymentId ||
            claims[CLAIMS.data] !== 'opaque-deep-link-data-001'
          ) {
            throw new Error('wrong message type');
          }
          const items = claims[CLAIMS.contentItems];
          if (!Array.isArray(items)) throw new Error('missing content items');
          state.deepLinkContentItems.push(...items);
          response.writeHead(204);
          response.end();
        } catch {
          json(response, 400, { error: 'invalid_deep_link_response' });
        }
        return;
      }

      if (
        request.method === 'POST' &&
        url.pathname === '/contexts/course-eng-101/lineitems'
      ) {
        if (consumeFailure(failures, 'ags', response)) return;
        if (!requireScope(request, response, tokens, SCOPES.lineItem)) return;
        try {
          const lineItem = JSON.parse(body) as Record<string, unknown>;
          const id = `lineitem-${String(lineItem.resourceId ?? state.lineItems.size + 1)}`;
          const stored = { ...lineItem, id: `${baseUrl}/lineitems/${id}` };
          state.lineItems.set(id, stored);
          json(response, 201, stored, {
            location: `${baseUrl}/lineitems/${id}`,
          });
        } catch {
          json(response, 400, { error: 'invalid_lineitem' });
        }
        return;
      }

      const scoreMatch = url.pathname.match(/^\/lineitems\/([^/]+)\/scores$/);
      if (request.method === 'POST' && scoreMatch) {
        if (consumeFailure(failures, 'ags', response)) return;
        if (!requireScope(request, response, tokens, SCOPES.score)) return;
        const idempotencyKey = request.headers['idempotency-key'];
        if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
          json(response, 400, { error: 'missing_idempotency_key' });
          return;
        }
        if (!state.scores.has(idempotencyKey)) {
          try {
            state.scores.set(idempotencyKey, {
              ...(JSON.parse(body) as Record<string, unknown>),
              lineItemId: scoreMatch[1],
            });
          } catch {
            json(response, 400, { error: 'invalid_score' });
            return;
          }
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

  const registration: LtiRegistration = {
    id: 'registration-blackboard-001',
    organizationId: 'organization-ua-001',
    provider: 'blackboard',
    displayName: 'Blackboard Reference Mock',
    issuer: baseUrl,
    clientId: MOCK_LTI_SEED.clientId,
    deploymentId: MOCK_LTI_SEED.deploymentId,
    authorizationEndpoint: `${baseUrl}/oidc/auth`,
    tokenEndpoint: `${baseUrl}/oauth2/token`,
    jwksUrl: `${baseUrl}/.well-known/jwks.json`,
    allowedServiceOrigins: [baseUrl],
    targetLinkUri: 'http://localhost:5174/lti/launch',
    enabled: true,
  };

  return {
    baseUrl,
    registration,
    seed: MOCK_LTI_SEED,
    tool: {
      keyId: TOOL_KEY_ID,
      privateKeyPem: TOOL_PRIVATE_KEY,
      publicKeyPem: TOOL_PUBLIC_KEY,
    },
    journal,
    state,
    failNext(kind, failure) {
      failures.set(kind, failure);
    },
    async close() {
      server.close();
      await once(server, 'close');
    },
  };
}
