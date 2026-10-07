import { prisma } from '~/utils/db.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { getClientIp, ipHash } from '~/utils/ip.server';
import { createHash } from 'node:crypto';
import { validationError } from '@rvf/react-router';
import type { Prisma } from '@app/prisma';

export type LimitScope = 'user' | 'org' | 'ip' | 'global';

export type LimitDecision =
  | 'ALLOWED'
  | 'DENIED_USER'
  | 'DENIED_ORG'
  | 'DENIED_IP'
  | 'DENIED_GLOBAL'
  | 'DENIED_PAYLOAD'
  | 'DENIED_CONCURRENCY';

export type LimitResult = {
  allowed: true;
} | {
  allowed: false;
  scope: LimitScope;
  retryAfterSeconds: number;
};

function retryAfterHeader(retryAfterSeconds: number) {
  return String(Math.max(1, Math.ceil(retryAfterSeconds)));
}

/**
 * 429 for JSON/fetch callers. `error` carries the machine-readable shape;
 * `success: false` and the top-level `message` follow the convention the
 * existing clients already read (see the PDF extractors and prompt generators).
 */
export function rateLimitedJson(scope: LimitScope, retryAfterSeconds: number, message?: string) {
  const text = message ?? 'Please wait before trying again.';
  const body = {
    success: false,
    message: text,
    error: {
      code: 'RATE_LIMITED',
      scope,
      retryAfterSeconds,
      message: text,
    },
  };
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': retryAfterHeader(retryAfterSeconds),
    },
  });
}

/**
 * The per-session turn cap is a property of the conversation, not of time, so it
 * carries no Retry-After and says what to do instead of "try again later".
 */
export function sessionTurnLimitJson(maxTurns: number) {
  const text = `This tutor session has reached its limit of ${maxTurns} messages. Start a new tutor session to keep going.`;
  return new Response(
    JSON.stringify({
      success: false,
      message: text,
      error: { code: 'SESSION_TURN_LIMIT', scope: 'user', maxTurns, message: text },
    }),
    { status: 429, headers: { 'Content-Type': 'application/json' } }
  );
}

/**
 * 429 for <ValidatedForm> routes. rvf only renders `fieldErrors`, so a plain
 * JSON body would leave the form silently doing nothing.
 */
export function rateLimitedFormResponse(
  field: string,
  retryAfterSeconds: number,
  message: string
) {
  return validationError({ fieldErrors: { [field]: message } }, undefined, {
    status: 429,
    headers: { 'Retry-After': retryAfterHeader(retryAfterSeconds) },
  });
}

function hashTarget(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

type BucketConsumeParams = {
  key: string;
  capacity: number;
  refillPerMs: number;
  cost: number;
  nowMs?: number;
};

type BucketSpec = BucketConsumeParams & {
  scope: LimitScope;
  subjectKey: string;
  route: string;
  feature?: string;
};

/** Upper bound on how long the limiter may delay a request before failing open. */
const LIMITER_TIMEOUT_MS = 2_500;

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('rate limiter timed out')), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Whole tokens accrued since "lastRefillAt". Only whole tokens are credited and
// "lastRefillAt" only advances by the time those tokens took to accrue, so
// fractional progress is never discarded (callers that arrive more often than
// one refill interval still earn tokens).
const ACCRUED_SQL = `FLOOR(EXCLUDED."refillPerMs" * GREATEST(0::float8, $5::float8 - EXTRACT(EPOCH FROM "RateLimitBucket"."lastRefillAt")::float8 * 1000))`;

/**
 * Single-statement token-bucket consume. The conditional DO UPDATE only fires
 * when enough tokens are available, so a denied call changes nothing and no row
 * is returned. Returns true when the cost was taken.
 */
async function tryTakeTokens({
  key,
  capacity,
  refillPerMs,
  cost,
  nowMs,
}: BucketConsumeParams): Promise<boolean> {
  const now = Math.floor(nowMs ?? Date.now());
  const rows = await prisma.$queryRawUnsafe<{ ok: number }[]>(
    `
    INSERT INTO "RateLimitBucket" ("key", "tokens", "capacity", "refillPerMs", "lastRefillAt", "updatedAt")
    VALUES ($1::text, GREATEST(0, $2::int - $3::int), $2::int, $4::float8,
            to_timestamp($5::float8 / 1000.0), to_timestamp($5::float8 / 1000.0))
    ON CONFLICT ("key") DO UPDATE SET
      "capacity" = EXCLUDED."capacity",
      "refillPerMs" = EXCLUDED."refillPerMs",
      "updatedAt" = to_timestamp($5::float8 / 1000.0),
      "tokens" = (LEAST(EXCLUDED."capacity"::float8, "RateLimitBucket"."tokens" + ${ACCRUED_SQL}) - $3::int)::int,
      "lastRefillAt" = CASE
        WHEN "RateLimitBucket"."tokens" + ${ACCRUED_SQL} >= EXCLUDED."capacity" THEN to_timestamp($5::float8 / 1000.0)
        WHEN EXCLUDED."refillPerMs" > 0 THEN to_timestamp(
          (EXTRACT(EPOCH FROM "RateLimitBucket"."lastRefillAt")::float8 * 1000 + ${ACCRUED_SQL} / EXCLUDED."refillPerMs") / 1000.0)
        ELSE "RateLimitBucket"."lastRefillAt"
      END
    WHERE LEAST(EXCLUDED."capacity"::float8, "RateLimitBucket"."tokens" + ${ACCRUED_SQL}) >= $3::int
    RETURNING 1 AS ok
    `,
    key,
    capacity,
    cost,
    refillPerMs,
    now
  );
  return rows.length > 0;
}

/** Seconds until `cost` tokens are available, from the stored (un-credited) state. */
async function secondsUntilAvailable(
  { key, cost, nowMs }: BucketConsumeParams
): Promise<number> {
  const now = Math.floor(nowMs ?? Date.now());
  const rows = await prisma.$queryRawUnsafe<
    { tokens: number; refillPerMs: number; lastMs: number }[]
  >(
    `SELECT "tokens", "refillPerMs", (EXTRACT(EPOCH FROM "lastRefillAt")::float8 * 1000) AS "lastMs"
       FROM "RateLimitBucket" WHERE "key" = $1::text`,
    key
  );
  const row = rows[0];
  if (!row || !(Number(row.refillPerMs) > 0)) return 3600;
  const missing = Math.max(1, cost - Number(row.tokens));
  const readyAtMs = Number(row.lastMs) + Math.ceil(missing / Number(row.refillPerMs));
  return Math.max(1, Math.ceil((readyAtMs - now) / 1000));
}

async function refundTokens({ key, cost }: BucketConsumeParams) {
  await prisma.$queryRawUnsafe(
    `UPDATE "RateLimitBucket"
        SET "tokens" = LEAST("capacity", "tokens" + $2::int)
      WHERE "key" = $1::text
      RETURNING 1 AS ok`,
    key,
    cost
  );
}

// --- Single-flight leases -------------------------------------------------
// A lease is a row in "RateLimitBucket" whose "lastRefillAt" is the expiry.
// Unlike session-level advisory locks (which are bound to one pooled
// connection and leak if the unlock lands on another one), a lease is plain
// data: it needs no connection affinity and expires by itself after the TTL.

export type SingleFlightResult<T> =
  | { ran: true; value: T }
  | { ran: false };

export async function withSingleFlight<T>(
  name: string,
  fn: () => Promise<T>,
  options: { ttlMs?: number } = {}
): Promise<SingleFlightResult<T>> {
  const key = `lease:${name}`;
  const ttlMs = Math.max(1_000, Math.floor(options.ttlMs ?? RATE_LIMITS.pdfExtract.leaseTtlMs));
  let lease: string | null = null;
  try {
    const rows = await withTimeout(
      prisma.$queryRawUnsafe<{ lease: string }[]>(
        `
        INSERT INTO "RateLimitBucket" ("key", "tokens", "capacity", "refillPerMs", "lastRefillAt", "updatedAt")
        VALUES ($1::text, 1, 1, 0, clock_timestamp() + ($2::int * interval '1 millisecond'), now())
        ON CONFLICT ("key") DO UPDATE SET
          "tokens" = 1,
          "lastRefillAt" = clock_timestamp() + ($2::int * interval '1 millisecond'),
          "updatedAt" = now()
        WHERE "RateLimitBucket"."lastRefillAt" <= clock_timestamp()
        RETURNING (EXTRACT(EPOCH FROM "lastRefillAt") * 1000000)::bigint::text AS lease
        `,
        key,
        ttlMs
      ),
      LIMITER_TIMEOUT_MS
    );
    if (rows.length === 0) return { ran: false };
    lease = rows[0]!.lease;
  } catch (error) {
    // Fail open: the lease is a cost guard, not a correctness requirement.
    console.warn('single_flight_failed_open', { name, error });
  }

  try {
    return { ran: true, value: await fn() };
  } finally {
    if (lease) {
      await prisma
        .$queryRawUnsafe(
          `DELETE FROM "RateLimitBucket"
            WHERE "key" = $1::text
              AND (EXTRACT(EPOCH FROM "lastRefillAt") * 1000000)::bigint::text = $2::text
            RETURNING 1 AS ok`,
          key,
          lease
        )
        .catch(() => {
          // The lease expires on its own after the TTL.
        });
    }
  }
}

async function logDecision(params: {
  route: string;
  feature?: string;
  scope: LimitScope;
  decision: LimitDecision;
  subjectKey: string;
  retryAfterSeconds?: number;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.rateLimitDecision.create({
      data: {
        route: params.route,
        feature: params.feature ?? null,
        scope: params.scope,
        decision: params.decision,
        subjectKey: params.subjectKey,
        retryAfterSeconds: params.retryAfterSeconds ?? null,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonObject,
      },
    });
  } catch (error) {
    // Do not fail requests on logging errors.
    console.warn('rate_limit_decision_log_failed', { error });
  }
}

/**
 * Takes one cost from each bucket in order (put per-user buckets before shared
 * ones). The first bucket that cannot pay stops the walk and every bucket
 * already charged for this request is refunded, so a denied request never uses
 * up daily or platform-wide capacity. Any limiter fault fails open.
 */
async function consumeAll(buckets: BucketSpec[]): Promise<LimitResult> {
  const charged: BucketSpec[] = [];
  try {
    return await withTimeout(
      (async (): Promise<LimitResult> => {
        for (const bucket of buckets) {
          if (await tryTakeTokens(bucket)) {
            charged.push(bucket);
            continue;
          }
          const retryAfterSeconds = await secondsUntilAvailable(bucket);
          for (const done of charged) {
            await refundTokens(done).catch(() => {});
          }
          charged.length = 0;
          // Denials are the only decisions logged: one row per rejected request,
          // not one per request.
          void logDecision({
            route: bucket.route,
            feature: bucket.feature,
            scope: bucket.scope,
            decision:
              bucket.scope === 'user'
                ? 'DENIED_USER'
                : bucket.scope === 'org'
                  ? 'DENIED_ORG'
                  : bucket.scope === 'ip'
                    ? 'DENIED_IP'
                    : 'DENIED_GLOBAL',
            subjectKey: bucket.subjectKey,
            retryAfterSeconds,
          });
          return { allowed: false, scope: bucket.scope, retryAfterSeconds };
        }
        return { allowed: true };
      })(),
      LIMITER_TIMEOUT_MS * 2
    );
  } catch (error) {
    // Fail open: allow the request but record the fault. Undo partial charges
    // best-effort so a mid-walk fault does not silently burn user capacity.
    for (const done of charged) {
      await refundTokens(done).catch(() => {});
    }
    console.warn('rate_limit_failed_open', { error });
    return { allowed: true };
  }
}

// Public per-route helpers

const MINUTE_MS = 60_000;
const TEN_MINUTES_MS = 600_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

type WindowSpec = {
  key: string;
  limit: number;
  windowMs: number;
  scope: LimitScope;
  subjectKey: string;
  route: string;
  feature?: string;
  nowMs?: number;
};

/**
 * One independent bucket per window: it holds `limit` tokens and refills at
 * `limit / windowMs`, so a caller can always do `limit` requests in that window
 * regardless of how they spread the earlier windows. (Reusing a slower window's
 * refill rate for a faster window's bucket makes the effective limit far lower
 * than the measured one.)
 */
function windowBucket(spec: WindowSpec): BucketSpec {
  return {
    key: spec.key,
    capacity: spec.limit,
    refillPerMs: spec.limit / spec.windowMs,
    cost: 1,
    nowMs: spec.nowMs,
    scope: spec.scope,
    subjectKey: spec.subjectKey,
    route: spec.route,
    feature: spec.feature,
  };
}

async function peekWindowBucket(spec: WindowSpec): Promise<boolean> {
  const bucket = windowBucket(spec);
  const now = Math.floor(spec.nowMs ?? Date.now());
  const rows = await prisma.$queryRawUnsafe<
    { tokens: number; capacity: number; refillPerMs: number; lastMs: number }[]
  >(
    `SELECT "tokens", "capacity", "refillPerMs", (EXTRACT(EPOCH FROM "lastRefillAt")::float8 * 1000) AS "lastMs"
       FROM "RateLimitBucket" WHERE "key" = $1::text`,
    bucket.key
  );
  const row = rows[0];
  if (!row) return true;
  const elapsed = Math.max(0, now - Number(row.lastMs));
  const accrued = Math.floor(Number(row.refillPerMs) * elapsed);
  const effective = Math.min(Number(row.capacity), Number(row.tokens) + accrued);
  return effective >= bucket.cost;
}

async function peekConsumeAll(buckets: WindowSpec[]): Promise<LimitResult> {
  for (const bucket of buckets) {
    if (!(await peekWindowBucket(bucket))) {
      const retryAfterSeconds = await secondsUntilAvailable(windowBucket(bucket));
      return { allowed: false, scope: bucket.scope, retryAfterSeconds };
    }
  }
  return { allowed: true };
}

export async function enforceTutorLimits(params: {
  request: Request;
  membershipId: string;
  route: string;
  nowMs?: number;
}): Promise<LimitResult> {
  const { membershipId, route, nowMs } = params;
  const limits = RATE_LIMITS.tutor;
  const userKeyBase = `user:tutor:${membershipId}`;
  const base = { route, feature: 'tutor', nowMs };
  // Per-student buckets first, shared platform buckets last, so a student who is
  // already over their own limit never touches platform-wide capacity.
  return consumeAll([
    windowBucket({ ...base, key: `${userKeyBase}:m`, limit: limits.perMinute, windowMs: MINUTE_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: `${userKeyBase}:h`, limit: limits.perHour, windowMs: HOUR_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: `${userKeyBase}:d`, limit: limits.perDay, windowMs: DAY_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: 'global:tutor:m', limit: limits.globalPerMinute, windowMs: MINUTE_MS, scope: 'global', subjectKey: 'global:tutor' }),
    windowBucket({ ...base, key: 'global:tutor:h', limit: limits.globalPerHour, windowMs: HOUR_MS, scope: 'global', subjectKey: 'global:tutor' }),
  ]);
}

export async function enforceGradingLimits(params: {
  request: Request;
  membershipId: string;
  route: string;
  nowMs?: number;
}): Promise<LimitResult> {
  const { membershipId, route, nowMs } = params;
  const limits = RATE_LIMITS.grading;
  const userKeyBase = `user:grading:${membershipId}`;
  const base = { route, feature: 'grading', nowMs };
  return consumeAll([
    windowBucket({ ...base, key: `${userKeyBase}:m`, limit: limits.perMinute, windowMs: MINUTE_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: `${userKeyBase}:10m`, limit: limits.perTenMinutes, windowMs: TEN_MINUTES_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: `${userKeyBase}:h`, limit: limits.perHour, windowMs: HOUR_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: `${userKeyBase}:d`, limit: limits.perDay, windowMs: DAY_MS, scope: 'user', subjectKey: userKeyBase }),
    windowBucket({ ...base, key: 'global:grading:m', limit: limits.globalPerMinute, windowMs: MINUTE_MS, scope: 'global', subjectKey: 'global:grading' }),
  ]);
}

function perTeacherThreeWindows(
  limits: { perMinute: number; perHour: number; perDay: number },
  params: { membershipId: string; route: string; feature: string; nowMs?: number }
) {
  const userKeyBase = `user:${params.feature}:${params.membershipId}`;
  const base = { route: params.route, feature: params.feature, nowMs: params.nowMs, scope: 'user' as const, subjectKey: userKeyBase };
  return consumeAll([
    windowBucket({ ...base, key: `${userKeyBase}:m`, limit: limits.perMinute, windowMs: MINUTE_MS }),
    windowBucket({ ...base, key: `${userKeyBase}:h`, limit: limits.perHour, windowMs: HOUR_MS }),
    windowBucket({ ...base, key: `${userKeyBase}:d`, limit: limits.perDay, windowMs: DAY_MS }),
  ]);
}

export async function enforceTeacherGeneratorLimits(params: {
  membershipId: string;
  route: string;
  feature: string;
  nowMs?: number;
}): Promise<LimitResult> {
  return perTeacherThreeWindows(RATE_LIMITS.promptGenerators, params);
}

export async function enforcePdfExtractorLimits(params: {
  membershipId: string;
  route: string;
  feature: string;
  nowMs?: number;
}): Promise<LimitResult> {
  return perTeacherThreeWindows(RATE_LIMITS.pdfExtract, params);
}

export async function enforceUnauthByIpAndTarget(params: {
  request: Request;
  route: string;
  targetKey: string; // email or other logical target
  perIpPerMinute: number;
  perIpPerHour: number;
  perTargetPerHour: number;
  nowMs?: number;
}): Promise<LimitResult> {
  const { request, route, targetKey, perIpPerMinute, perIpPerHour, perTargetPerHour, nowMs } = params;
  const ip = getClientIp(request);
  const ipKeyBase = `ip:${ipHash(ip)}:${route}`;
  // Hash the target so emails never land in bucket keys or the decision log.
  const targetBase = `target:${hashTarget(targetKey)}:${route}`;
  const base = { route, nowMs };
  return consumeAll([
    windowBucket({ ...base, key: `${ipKeyBase}:m`, limit: perIpPerMinute, windowMs: MINUTE_MS, scope: 'ip', subjectKey: ipKeyBase }),
    windowBucket({ ...base, key: `${ipKeyBase}:h`, limit: perIpPerHour, windowMs: HOUR_MS, scope: 'ip', subjectKey: ipKeyBase }),
    // Per-target (email): the budget that stops mail-bombing one address.
    windowBucket({ ...base, key: `${targetBase}:h`, limit: perTargetPerHour, windowMs: HOUR_MS, scope: 'ip', subjectKey: targetBase }),
  ]);
}

/** Login: per-handle limits apply to every attempt; per-IP limits apply only after a failed login. */
export async function enforceLoginTargetRateLimit(params: {
  request: Request;
  route: string;
  targetKey: string;
  perTargetPerHour: number;
  nowMs?: number;
}): Promise<LimitResult> {
  const { request, route, targetKey, perTargetPerHour, nowMs } = params;
  const targetBase = `target:${hashTarget(targetKey)}:${route}`;
  const base = { route, nowMs };
  return consumeAll([
    windowBucket({
      ...base,
      key: `${targetBase}:h`,
      limit: perTargetPerHour,
      windowMs: HOUR_MS,
      scope: 'ip',
      subjectKey: targetBase,
    }),
  ]);
}

function failedLoginIpBuckets(params: {
  request: Request;
  route: string;
  perIpPerMinute: number;
  perIpPerHour: number;
  nowMs?: number;
}) {
  const { request, route, perIpPerMinute, perIpPerHour, nowMs } = params;
  const ip = getClientIp(request);
  const ipKeyBase = `ip:${ipHash(ip)}:${route}:failed`;
  const base = { route, nowMs };
  return [
    {
      ...base,
      key: `${ipKeyBase}:m`,
      limit: perIpPerMinute,
      windowMs: MINUTE_MS,
      scope: 'ip' as const,
      subjectKey: ipKeyBase,
    },
    {
      ...base,
      key: `${ipKeyBase}:h`,
      limit: perIpPerHour,
      windowMs: HOUR_MS,
      scope: 'ip' as const,
      subjectKey: ipKeyBase,
    },
  ];
}

export async function checkFailedLoginIpRateLimit(params: {
  request: Request;
  route: string;
  perIpPerMinute: number;
  perIpPerHour: number;
  nowMs?: number;
}): Promise<LimitResult> {
  return peekConsumeAll(failedLoginIpBuckets(params));
}

export async function recordFailedLoginIpRateLimit(params: {
  request: Request;
  route: string;
  perIpPerMinute: number;
  perIpPerHour: number;
  nowMs?: number;
}): Promise<LimitResult> {
  const buckets = failedLoginIpBuckets(params);
  return consumeAll(buckets.map((b) => windowBucket(b)));
}

export async function enforceUnauthByIpOnly(params: {
  request: Request;
  route: string;
  perIpPerMinute: number;
  perIpPerHour: number;
  nowMs?: number;
}): Promise<LimitResult> {
  const { request, route, perIpPerMinute, perIpPerHour, nowMs } = params;
  const ip = getClientIp(request);
  const ipKeyBase = `ip:${ipHash(ip)}:${route}`;
  const base = { route, nowMs };
  return consumeAll([
    windowBucket({
      ...base,
      key: `${ipKeyBase}:m`,
      limit: perIpPerMinute,
      windowMs: MINUTE_MS,
      scope: 'ip',
      subjectKey: ipKeyBase,
    }),
    windowBucket({
      ...base,
      key: `${ipKeyBase}:h`,
      limit: perIpPerHour,
      windowMs: HOUR_MS,
      scope: 'ip',
      subjectKey: ipKeyBase,
    }),
  ]);
}

export async function enforceAuthenticatedUserAndIp(params: {
  request: Request;
  route: string;
  userId: string;
  perUserPerHour: number;
  perIpPerMinute: number;
  perIpPerHour: number;
  nowMs?: number;
}): Promise<LimitResult> {
  const {
    request,
    route,
    userId,
    perUserPerHour,
    perIpPerMinute,
    perIpPerHour,
    nowMs,
  } = params;
  const ip = getClientIp(request);
  const ipKeyBase = `ip:${ipHash(ip)}:${route}`;
  const userKeyBase = `user:${userId}:${route}`;
  const base = { route, nowMs };
  return consumeAll([
    windowBucket({
      ...base,
      key: `${userKeyBase}:h`,
      limit: perUserPerHour,
      windowMs: HOUR_MS,
      scope: 'user',
      subjectKey: userKeyBase,
    }),
    windowBucket({
      ...base,
      key: `${ipKeyBase}:m`,
      limit: perIpPerMinute,
      windowMs: MINUTE_MS,
      scope: 'ip',
      subjectKey: ipKeyBase,
    }),
    windowBucket({
      ...base,
      key: `${ipKeyBase}:h`,
      limit: perIpPerHour,
      windowMs: HOUR_MS,
      scope: 'ip',
      subjectKey: ipKeyBase,
    }),
  ]);
}

// Utilities for tutor input controls
export function clampTutorMessage(text: string): string {
  const max = RATE_LIMITS.tutor.maxMessageChars;
  return text.length > max ? text.slice(0, max) : text;
}

export function trimChatHistoryToBudget<T extends { role: string; content: string }>(messages: T[], budget = RATE_LIMITS.tutor.transcriptCharBudget): T[] {
  let total = 0;
  const kept: T[] = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    const len = (m.content ?? '').length;
    if (total + len > budget) break;
    kept.push(m);
    total += len;
  }
  return kept.reverse();
}

