import { prisma } from '~/utils/db.server';
import { RATE_LIMITS } from '~/config/rate-limits';
import { getClientIp, ipHash } from '~/utils/ip.server';

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

export function rateLimitedJson(scope: LimitScope, retryAfterSeconds: number, message?: string) {
  const body = {
    error: {
      code: 'RATE_LIMITED',
      scope,
      retryAfterSeconds,
      message: message ?? 'Please wait before trying again.',
    },
  };
  return new Response(JSON.stringify(body), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds)) ),
    },
  });
}

type BucketConsumeParams = {
  key: string;
  capacity: number;
  refillPerMs: number;
  cost: number;
  nowMs?: number;
};

// Single-statement upsert with refill math. Only subtracts when enough tokens exist.
async function consumeBucket({
  key,
  capacity,
  refillPerMs,
  cost,
  nowMs,
}: BucketConsumeParams): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  // Use a deterministic now() so tests can drive time.
  // to_timestamp(ms/1000.0) yields timestamptz
  const nowParam = Math.floor((nowMs ?? Date.now()));
  const result = await prisma.$queryRawUnsafe<[{ allowed: boolean; retry_after_s: number } & Record<string, unknown>]>(`
    WITH upserted AS (
      INSERT INTO "RateLimitBucket" ("key", "tokens", "capacity", "refillPerMs", "lastRefillAt", "updatedAt")
      VALUES ($1, GREATEST(0, $2 - $3), $2, $4, to_timestamp($5 / 1000.0), to_timestamp($5 / 1000.0))
      ON CONFLICT ("key") DO UPDATE
      SET
        "capacity" = EXCLUDED."capacity",
        "refillPerMs" = EXCLUDED."refillPerMs",
        "updatedAt" = to_timestamp($5 / 1000.0),
        "lastRefillAt" = to_timestamp($5 / 1000.0),
        "tokens" = (
          -- Refill from lastRefillAt, cap at capacity
          CASE
            WHEN LEAST(EXCLUDED."capacity",
                       "RateLimitBucket"."tokens" + FLOOR( EXCLUDED."refillPerMs" * GREATEST(0, ($5 - EXTRACT(EPOCH FROM ("RateLimitBucket"."lastRefillAt")) * 1000)) )
                 ) >= $3
            THEN
              -- Enough tokens: subtract cost
              LEAST(EXCLUDED."capacity",
                    "RateLimitBucket"."tokens" + FLOOR( EXCLUDED."refillPerMs" * GREATEST(0, ($5 - EXTRACT(EPOCH FROM ("RateLimitBucket"."lastRefillAt")) * 1000)) )
               ) - $3
            ELSE
              -- Not enough: do not subtract
              LEAST(EXCLUDED."capacity",
                    "RateLimitBucket"."tokens" + FLOOR( EXCLUDED."refillPerMs" * GREATEST(0, ($5 - EXTRACT(EPOCH FROM ("RateLimitBucket"."lastRefillAt")) * 1000)) )
               )
          END
        )
      RETURNING
        "capacity",
        "refillPerMs",
        -- tokens AFTER the update above
        "tokens" as tokens_after
    )
    SELECT
      CASE
        WHEN (upserted."tokens_after" + $3) <= upserted."capacity" THEN true
        ELSE false
      END AS allowed,
      CASE
        WHEN (upserted."tokens_after" + $3) <= upserted."capacity" THEN 0
        ELSE
          CASE
            WHEN upserted."refillPerMs" <= 0 THEN 3600 -- 1 hour fallback
            ELSE CEIL( ($3 - upserted."tokens_after") / upserted."refillPerMs" / 1000.0 )
          END
      END AS retry_after_s
    FROM upserted
  `, key, capacity, cost, refillPerMs, nowParam);

  const row = result?.[0];
  const allowed = !!row?.allowed;
  const retryAfterSeconds = Math.max(0, Number(row?.retry_after_s ?? 0));
  return { allowed, retryAfterSeconds };
}

export async function withAdvisorySingleFlight<T>(name: string, fn: () => Promise<T>): Promise<T> {
  // Use pg advisory locks to prevent duplicate in-flight work per process across instances.
  // We scope by a stable hash of the name; hashtextextended is available in SQL but for portability use application-side murmur via a simple hash.
  // We execute SELECT pg_try_advisory_lock(hash) and unlock after.
  const hashKeySql = `SELECT hashtextextended($1, 0) AS key`;
  const [{ key }] = await prisma.$queryRawUnsafe<{ key: string }[]>(hashKeySql, name);
  try {
    const lockRow = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT pg_try_advisory_lock($1) AS ok`,
      key
    );
    if (!lockRow?.[0]?.ok) {
      throw new Error('CONCURRENCY: another request is in-flight');
    }
    return await fn();
  } finally {
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock($1)`, key).catch(() => {});
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
        metadata: params.metadata ?? {},
      },
    });
  } catch (error) {
    // Do not fail requests on logging errors.
    console.warn('rate_limit_decision_log_failed', { error });
  }
}

// Helper to test a set of buckets and return the worst-case retryAfter if any denies.
async function consumeAll(buckets: Array<BucketConsumeParams & { scope: LimitScope; subjectKey: string; route: string; feature?: string }>): Promise<LimitResult> {
  try {
    let worst: { scope: LimitScope; retryAfterSeconds: number } | null = null;
    for (const b of buckets) {
      const { allowed, retryAfterSeconds } = await consumeBucket(b);
      if (!allowed) {
        if (!worst || retryAfterSeconds > worst.retryAfterSeconds) {
          worst = { scope: b.scope, retryAfterSeconds };
        }
      }
    }
    if (worst) {
      // Log first-denied scope
      const firstDenied = buckets.find((b) => {
        // Re-evaluate quickly for logging; avoid double SQL by trusting local 'worst' scope.
        return b.scope === worst!.scope;
      })!;
      await logDecision({
        route: firstDenied.route,
        feature: firstDenied.feature,
        scope: worst.scope,
        decision:
          worst.scope === 'user' ? 'DENIED_USER'
          : worst.scope === 'org' ? 'DENIED_ORG'
          : worst.scope === 'ip' ? 'DENIED_IP'
          : 'DENIED_GLOBAL',
        subjectKey: firstDenied.subjectKey,
        retryAfterSeconds: worst.retryAfterSeconds,
      });
      return { allowed: false, scope: worst.scope, retryAfterSeconds: worst.retryAfterSeconds };
    }
    // Log an allow for the primary scope (user when present)
    const primary = buckets.find((b) => b.scope === 'user') ?? buckets[0]!;
    await logDecision({
      route: primary.route,
      feature: primary.feature,
      scope: primary.scope,
      decision: 'ALLOWED',
      subjectKey: primary.subjectKey,
    });
    return { allowed: true };
  } catch (error) {
    // Fail open: allow the request but record the fault.
    console.warn('rate_limit_failed_open', { error });
    return { allowed: true };
  }
}

// Public per-route helpers

export async function enforceTutorLimits(params: {
  request: Request;
  membershipId: string;
  route: string;
  nowMs?: number;
}): Promise<LimitResult> {
  const { membershipId, route, nowMs } = params;
  const limits = RATE_LIMITS.tutor;
  const userKeyBase = `user:tutor:${membershipId}`;
  const globalKeyBase = `global:tutor`;
  const buckets: Array<BucketConsumeParams & { scope: LimitScope; subjectKey: string; route: string; feature?: string }> = [
    // Per user (minute burst)
    {
      key: `${userKeyBase}:m`,
      capacity: limits.perMinute,
      refillPerMs: limits.perHour / 3_600_000, // sustained hourly
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature: 'tutor',
    },
    // Daily cap, continuous refill approximation
    {
      key: `${userKeyBase}:d`,
      capacity: limits.perDay,
      refillPerMs: limits.perDay / 86_400_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature: 'tutor',
    },
    // Global ceilings
    {
      key: `${globalKeyBase}:m`,
      capacity: limits.globalPerMinute,
      refillPerMs: limits.globalPerHour / 3_600_000,
      cost: 1,
      nowMs,
      scope: 'global',
      subjectKey: globalKeyBase,
      route,
      feature: 'tutor',
    },
  ];
  return consumeAll(buckets);
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
  const globalKeyBase = `global:grading`;
  const buckets: Array<BucketConsumeParams & { scope: LimitScope; subjectKey: string; route: string; feature?: string }> = [
    // Minute burst
    {
      key: `${userKeyBase}:m`,
      capacity: limits.perMinute,
      refillPerMs: limits.perHour / 3_600_000, // hourly sustained
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature: 'grading',
    },
    // 10-minute window
    {
      key: `${userKeyBase}:10m`,
      capacity: limits.perTenMinutes,
      refillPerMs: limits.perTenMinutes / 600_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature: 'grading',
    },
    // Daily cap
    {
      key: `${userKeyBase}:d`,
      capacity: limits.perDay,
      refillPerMs: limits.perDay / 86_400_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature: 'grading',
    },
    // Global per-minute ceiling
    {
      key: `${globalKeyBase}:m`,
      capacity: limits.globalPerMinute,
      refillPerMs: limits.globalPerMinute / 60_000,
      cost: 1,
      nowMs,
      scope: 'global',
      subjectKey: globalKeyBase,
      route,
      feature: 'grading',
    },
  ];
  return consumeAll(buckets);
}

export async function enforceTeacherGeneratorLimits(params: {
  membershipId: string;
  route: string;
  feature: string;
  nowMs?: number;
}): Promise<LimitResult> {
  const { membershipId, route, feature, nowMs } = params;
  const limits = RATE_LIMITS.promptGenerators;
  const userKeyBase = `user:${feature}:${membershipId}`;
  const buckets: Array<BucketConsumeParams & { scope: LimitScope; subjectKey: string; route: string; feature?: string }> = [
    {
      key: `${userKeyBase}:m`,
      capacity: limits.perMinute,
      refillPerMs: limits.perHour / 3_600_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature,
    },
    {
      key: `${userKeyBase}:d`,
      capacity: limits.perDay,
      refillPerMs: limits.perDay / 86_400_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature,
    },
  ];
  return consumeAll(buckets);
}

export async function enforcePdfExtractorLimits(params: {
  membershipId: string;
  route: string;
  feature: string;
  nowMs?: number;
}): Promise<LimitResult> {
  const { membershipId, route, feature, nowMs } = params;
  const limits = RATE_LIMITS.pdfExtract;
  const userKeyBase = `user:${feature}:${membershipId}`;
  const buckets: Array<BucketConsumeParams & { scope: LimitScope; subjectKey: string; route: string; feature?: string }> = [
    {
      key: `${userKeyBase}:m`,
      capacity: limits.perMinute,
      refillPerMs: limits.perHour / 3_600_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature,
    },
    {
      key: `${userKeyBase}:d`,
      capacity: limits.perDay,
      refillPerMs: limits.perDay / 86_400_000,
      cost: 1,
      nowMs,
      scope: 'user',
      subjectKey: userKeyBase,
      route,
      feature,
    },
  ];
  return consumeAll(buckets);
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
  const targetBase = `target:${targetKey}:${route}`;
  const buckets: Array<BucketConsumeParams & { scope: LimitScope; subjectKey: string; route: string; feature?: string }> = [
    // Per-IP: burst + sustained hour
    {
      key: `${ipKeyBase}:m`,
      capacity: perIpPerMinute,
      refillPerMs: perIpPerHour / 3_600_000,
      cost: 1,
      nowMs,
      scope: 'ip',
      subjectKey: ipKeyBase,
      route,
    },
    // Per-target (email), sustained hour
    {
      key: `${targetBase}:h`,
      capacity: perTargetPerHour,
      refillPerMs: perTargetPerHour / 3_600_000,
      cost: 1,
      nowMs,
      scope: 'ip', // treat as ip-level in messaging
      subjectKey: targetBase,
      route,
    },
  ];
  return consumeAll(buckets);
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

