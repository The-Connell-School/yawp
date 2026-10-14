import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import {
  buildInternalApiSignatureBaseString,
  INTERNAL_API_HEADER_ACTOR,
  INTERNAL_API_HEADER_KEY_ID,
  INTERNAL_API_HEADER_NONCE,
  INTERNAL_API_HEADER_SIGNATURE,
  INTERNAL_API_HEADER_TIMESTAMP,
  internalApiRawQueryString,
} from './internal-platform-signing.server';

export {
  buildInternalApiSignatureBaseString,
  INTERNAL_API_HEADER_ACTOR,
  INTERNAL_API_HEADER_KEY_ID,
  INTERNAL_API_HEADER_NONCE,
  INTERNAL_API_HEADER_SIGNATURE,
  INTERNAL_API_HEADER_TIMESTAMP,
  internalApiRawQueryString,
  signInternalApiRequest,
} from './internal-platform-signing.server';

export const INTERNAL_API_SCOPES = [
  'rubrics:read',
  'rubrics:write',
  'flags:read',
  'flags:write',
  'stats:read',
  'audit:read',
  'management:read',
  'management:write',
] as const;

export type InternalApiScope = (typeof INTERNAL_API_SCOPES)[number];

const scopeSchema = z.enum(INTERNAL_API_SCOPES);

const keySchema = z
  .object({
    id: z.string().min(1).max(64),
    secret: z.string().min(32).max(256),
    scopes: z.array(scopeSchema).min(1),
  })
  .strict();

export type InternalApiKey = z.infer<typeof keySchema>;

const CLOCK_SKEW_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;

const response = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
  });

const digest = (value: string) => createHash('sha256').update(value).digest();

const rateBuckets = new Map<string, { count: number; windowStart: number }>();

export function legacyInternalKeyAllowed() {
  return process.env.LEGACY_INTERNAL_KEY_ALLOWED !== 'false';
}

export function parseInternalApiKeysFromEnv(): InternalApiKey[] {
  const raw = process.env.YAWP_INTERNAL_API_KEYS?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => keySchema.safeParse(entry))
      .filter((result) => result.success)
      .map((result) => result.data);
  } catch {
    return [];
  }
}

export function internalApiKeysConfigured() {
  const keys = parseInternalApiKeysFromEnv();
  return (
    keys.length > 0 ||
    Boolean(process.env.YAWP_MANAGEMENT_SERVICE_KEY?.trim()) ||
    Boolean(process.env.YAWP_CONTENT_SERVICE_KEY?.trim())
  );
}

function timingSafeEqualString(a: string, b: string) {
  const left = digest(a);
  const right = digest(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

const FAILED_AUTH_RATE_LIMIT_MAX = 60;

function checkRateLimit(bucketKey: string, max = RATE_LIMIT_MAX) {
  const now = Date.now();
  const bucket = rateBuckets.get(bucketKey);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(bucketKey, { count: 1, windowStart: now });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= max;
}

export function resetInternalApiRateLimitBuckets() {
  rateBuckets.clear();
}

function clientIp(request: Request) {
  const forwarded = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  return (
    forwarded || request.headers.get('cf-connecting-ip')?.trim() || 'unknown'
  );
}

function legacyContentRoute(pathname: string) {
  return (
    pathname.startsWith('/api/internal/v1/rubric-catalog') ||
    pathname.startsWith('/api/internal/v1/rubrics')
  );
}

export function resolveInternalApiScope(
  pathname: string,
  method: string
): InternalApiScope | null {
  const write = method !== 'GET' && method !== 'HEAD';
  if (pathname === '/api/internal/v1/stats/grading') {
    return 'stats:read';
  }
  if (
    pathname === '/api/internal/v1/audit' ||
    pathname.startsWith('/api/internal/v1/admin/audit/')
  ) {
    return 'audit:read';
  }
  if (pathname.startsWith('/api/internal/v1/feature-flags')) {
    return write ? 'flags:write' : 'flags:read';
  }
  if (
    pathname.startsWith('/api/internal/v1/rubric-catalog') ||
    pathname.startsWith('/api/internal/v1/rubrics')
  ) {
    return write ? 'rubrics:write' : 'rubrics:read';
  }
  return write ? 'management:write' : 'management:read';
}

function legacyKeysForPath(pathname: string) {
  const keys: string[] = [];
  const management = process.env.YAWP_MANAGEMENT_SERVICE_KEY?.trim();
  const content = process.env.YAWP_CONTENT_SERVICE_KEY?.trim();
  if (management) keys.push(management);
  if (legacyContentRoute(pathname) && content && content !== management) {
    keys.push(content);
  }
  return keys;
}

function authorizeLegacyBearer(request: Request) {
  if (!legacyInternalKeyAllowed())
    return response({ error: 'Unauthorized' }, 401);
  const pathname = new URL(request.url).pathname;
  const management = process.env.YAWP_MANAGEMENT_SERVICE_KEY?.trim();
  const content = process.env.YAWP_CONTENT_SERVICE_KEY?.trim();
  if (!management && !content) return response({ error: 'Not found' }, 404);
  const keys = legacyKeysForPath(pathname);
  if (!keys.length) return response({ error: 'Unauthorized' }, 401);
  for (const key of keys) {
    if (!/^[A-Za-z0-9_-]{43,}$/.test(key)) {
      return response({ error: 'Integration unavailable' }, 503);
    }
  }
  const supplied = request.headers.get('authorization') ?? '';
  if (supplied.length > 512) return response({ error: 'Unauthorized' }, 401);
  const valid = keys.some((key) =>
    timingSafeEqualString(supplied, `Bearer ${key}`)
  );
  if (!valid) return response({ error: 'Unauthorized' }, 401);
  return null;
}

const memoryNonceStore = new Set<string>();

async function reserveNonce(keyId: string, nonce: string, expiresAt: Date) {
  if (process.env.INTERNAL_API_NONCE_STORE === 'memory') {
    const compound = `${keyId}\0${nonce}`;
    if (memoryNonceStore.has(compound))
      return response({ error: 'Unauthorized' }, 401);
    memoryNonceStore.add(compound);
    return null;
  }
  await prisma.internalApiRequestNonce.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  try {
    await prisma.internalApiRequestNonce.create({
      data: { keyId, nonce, expiresAt },
    });
    return null;
  } catch {
    return response({ error: 'Unauthorized' }, 401);
  }
}

export function resetInternalApiMemoryNonceStore() {
  memoryNonceStore.clear();
}

export async function recordInternalPlatformWriteAudit(input: {
  actorEmail: string;
  keyId: string;
  endpoint: string;
  requestHash: string;
  result: string;
}) {
  try {
    await prisma.internalPlatformApiAudit.create({
      data: input,
    });
  } catch (error) {
    console.error('internal_platform_api_audit_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type InternalApiAuthContext = {
  mode: 'legacy' | 'hmac';
  keyId: string;
  actorEmail: string;
  scopes: readonly InternalApiScope[];
};

export async function authorizeInternalApiRequest(
  request: Request,
  options: {
    body?: Uint8Array | string;
    requiredScope?: InternalApiScope;
  } = {}
): Promise<Response | InternalApiAuthContext> {
  const url = new URL(request.url);
  const requiredScope =
    options.requiredScope ??
    resolveInternalApiScope(url.pathname, request.method);

  const signature = request.headers.get(INTERNAL_API_HEADER_SIGNATURE);
  if (!signature) {
    const legacy = authorizeLegacyBearer(request);
    if (legacy) return legacy;
    return {
      mode: 'legacy',
      keyId: 'legacy',
      actorEmail: 'legacy@yawp.internal',
      scopes: INTERNAL_API_SCOPES,
    };
  }

  const keys = parseInternalApiKeysFromEnv();
  if (!keys.length) return response({ error: 'Not found' }, 404);

  const keyId = request.headers.get(INTERNAL_API_HEADER_KEY_ID)?.trim() ?? '';
  const timestamp =
    request.headers.get(INTERNAL_API_HEADER_TIMESTAMP)?.trim() ?? '';
  const nonce = request.headers.get(INTERNAL_API_HEADER_NONCE)?.trim() ?? '';
  const actor = request.headers.get(INTERNAL_API_HEADER_ACTOR)?.trim() ?? '';
  if (!keyId || !timestamp || !nonce || !actor || !signature) {
    return response({ error: 'Unauthorized' }, 401);
  }
  if (
    keyId.length > 64 ||
    nonce.length > 128 ||
    actor.length > 320 ||
    signature.length > 128
  ) {
    return response({ error: 'Unauthorized' }, 401);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(actor)) {
    return response({ error: 'Unauthorized' }, 401);
  }
  const epochMs = Number(timestamp) * 1000;
  if (!Number.isFinite(epochMs))
    return response({ error: 'Unauthorized' }, 401);
  if (Math.abs(Date.now() - epochMs) > CLOCK_SKEW_MS) {
    return response({ error: 'Unauthorized' }, 401);
  }

  const key = keys.find((entry) => entry.id === keyId);
  if (!key) {
    if (
      !checkRateLimit(
        `failed-auth:${clientIp(request)}`,
        FAILED_AUTH_RATE_LIMIT_MAX
      )
    ) {
      return response({ error: 'Too many requests' }, 429);
    }
    return response({ error: 'Unauthorized' }, 401);
  }

  const body = options.body ?? '';
  const base = buildInternalApiSignatureBaseString({
    method: request.method,
    pathname: url.pathname,
    search: internalApiRawQueryString(url),
    timestamp,
    nonce,
    actor,
    body,
  });
  const expected = createHmac('sha256', key.secret)
    .update(base)
    .digest('base64url');
  if (!timingSafeEqualString(signature, expected)) {
    if (
      !checkRateLimit(
        `failed-auth:${clientIp(request)}`,
        FAILED_AUTH_RATE_LIMIT_MAX
      )
    ) {
      return response({ error: 'Too many requests' }, 429);
    }
    return response({ error: 'Unauthorized' }, 401);
  }

  if (!checkRateLimit(keyId))
    return response({ error: 'Too many requests' }, 429);

  if (requiredScope && !key.scopes.includes(requiredScope)) {
    return response({ error: 'Forbidden' }, 403);
  }

  const replay = await reserveNonce(
    keyId,
    nonce,
    new Date(epochMs + CLOCK_SKEW_MS)
  );
  if (replay) return replay;

  return {
    mode: 'hmac',
    keyId,
    actorEmail: actor.toLowerCase(),
    scopes: key.scopes,
  };
}

export async function authenticateInternalManagementRequest(
  request: Request,
  options: { body?: Uint8Array | string } = {}
) {
  if (!internalApiKeysConfigured()) {
    return response({ error: 'Not found' }, 404);
  }
  const auth = await authorizeInternalApiRequest(request, options);
  if (auth instanceof Response) return auth;
  return null;
}
