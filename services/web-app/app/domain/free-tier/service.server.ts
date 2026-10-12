import { recordTesterAudit, type TesterAuditActor } from './tester-audit.server';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import type { FreeTierApplicationStatus } from '@app/prisma';
import { assertTransition } from './state';
import { buildFreeTierEventLink } from './free-tier-public-url.server';
import {
  coarseUserAgent,
  FREE_TIER_SCAN_DEDUPE_MS,
  hashScanDedupeCookie,
} from './acquisition-token-scan.server';

/** Read at call time so ops can change it with an env var and tests can override it. */
export function getFreeTierReleaseCap(): number {
  const n = Number(process.env.FREE_TIER_RELEASE_CAP || '100');
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 100;
}

export const waitlistInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().toLowerCase().email().max(320),
    schoolName: z.string().trim().min(1).max(200),
    location: z.string().trim().min(1).max(200),
    gradeLevel: z.string().trim().min(1).max(50),
    // Honeypot field to deter bots
    middleName: z.string().max(200).optional(),
  })
  .strict();

export type WaitlistInput = z.infer<typeof waitlistInputSchema>;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

export function generateAcquisitionCode(): string {
  return randomBytes(6).toString('base64url');
}

const acquisitionTokenCoreSelect = {
  id: true,
  label: true,
  code: true,
  uses: true,
  maxUses: true,
  expiresAt: true,
  bypassWaitlist: true,
  disabledAt: true,
} as const;

type AcquisitionTokenClient = Pick<typeof prisma, 'acquisitionToken'>;
type AcquisitionTokenCreateClient = Pick<typeof prisma, 'acquisitionToken' | '$executeRaw'>;

async function findAcquisitionTokenByCredentialOn(
  client: AcquisitionTokenClient,
  credential: string
) {
  const trimmed = credential.trim();
  if (!trimmed) return null;
  const byCode = await client.acquisitionToken.findUnique({
    where: { code: trimmed },
    select: acquisitionTokenCoreSelect,
  });
  if (byCode) return byCode;
  return client.acquisitionToken.findUnique({
    where: { tokenHash: hashToken(trimmed) },
    select: acquisitionTokenCoreSelect,
  });
}

export async function findAcquisitionTokenByCredential(credential: string) {
  return findAcquisitionTokenByCredentialOn(prisma, credential);
}

export function canRedeemToken(record: {
  uses: number;
  maxUses: number | null;
  expiresAt: Date | null;
  bypassWaitlist: boolean;
  disabledAt?: Date | null;
}):
  | { ok: true; reason: null }
  | { ok: false; reason: 'expired' | 'exhausted' | 'disabled' } {
  if (record.disabledAt) return { ok: false, reason: 'disabled' };
  const now = Date.now();
  if (record.expiresAt && record.expiresAt.getTime() <= now) return { ok: false, reason: 'expired' };
  if (record.maxUses != null && record.uses >= record.maxUses) return { ok: false, reason: 'exhausted' };
  return { ok: true, reason: null };
}

export async function recordAcquisitionTokenScan(input: {
  tokenId: string;
  dedupeCookie: string;
  userAgent: string | null;
}) {
  try {
    const dedupeCookieHash = hashScanDedupeCookie(input.dedupeCookie);
    const since = new Date(Date.now() - FREE_TIER_SCAN_DEDUPE_MS);
    const recent = await prisma.acquisitionTokenScan.findFirst({
      where: {
        tokenId: input.tokenId,
        dedupeCookieHash,
        createdAt: { gte: since },
      },
      select: { id: true },
    });
    if (recent) return;
    await prisma.$transaction([
      prisma.acquisitionTokenScan.create({
        data: {
          tokenId: input.tokenId,
          dedupeCookieHash,
          userAgentCoarse: coarseUserAgent(input.userAgent),
        },
      }),
      prisma.acquisitionToken.update({
        where: { id: input.tokenId },
        data: { scanCount: { increment: 1 } },
      }),
    ]);
  } catch (error) {
    console.error('free_tier_scan_record_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function submitWaitlist(input: WaitlistInput) {
  const parsed = waitlistInputSchema.parse(input);
  if (parsed.middleName?.trim()) return { ok: true as const }; // honeypot: do nothing
  const email = normalizeEmail(parsed.email);
  // Create-only. A resubmission for an existing email is a silent no-op: letting
  // anyone who knows an address overwrite that applicant's name/school would be
  // a tampering path, and replying differently would reveal the address exists.
  // ON CONFLICT DO NOTHING keeps this a single statement with no error path.
  await prisma.freeTierApplication.createMany({
    data: [
      {
        name: parsed.name,
        email,
        schoolName: parsed.schoolName,
        location: parsed.location,
        gradeLevel: parsed.gradeLevel,
        status: 'LEAD',
      },
    ],
    skipDuplicates: true,
  });
  return { ok: true as const };
}

export const tokenCreateSchema = z
  .object({
    label: z.string().trim().min(1).max(200),
    bypassWaitlist: z.boolean().optional().default(false),
    maxUses: z.number().int().min(1).max(10000).optional(),
    expiresAt: z.union([z.string().datetime().transform((v) => new Date(v)), z.date()]).optional(),
    count: z.number().int().min(1).max(100).default(1),
    createdBy: z.string().trim().max(200).optional(),
    sourceName: z.string().trim().min(1).max(200).optional(),
    eventLocation: z.string().trim().min(1).max(200).optional(),
    eventDate: z.union([z.string().datetime().transform((v) => new Date(v)), z.date()]).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type TokenCreateInput = z.infer<typeof tokenCreateSchema>;

export const tokenPatchSchema = z
  .object({
    label: z.string().trim().min(1).max(200).optional(),
    bypassWaitlist: z.boolean().optional(),
    maxUses: z.number().int().min(1).max(10000).nullable().optional(),
    expiresAt: z.union([z.string().datetime().transform((v) => new Date(v)), z.date()]).nullable().optional(),
    sourceName: z.string().trim().min(1).max(200).nullable().optional(),
    eventLocation: z.string().trim().min(1).max(200).nullable().optional(),
    eventDate: z.union([z.string().datetime().transform((v) => new Date(v)), z.date()]).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();
export type TokenPatchInput = z.infer<typeof tokenPatchSchema>;

async function allocateUniqueAcquisitionCode(client: AcquisitionTokenClient = prisma) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateAcquisitionCode();
    const existing = await client.acquisitionToken.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!existing) return code;
  }
  throw new Error('acquisition_code_collision');
}

function tokenCreateFingerprint(parsed: TokenCreateInput) {
  return JSON.stringify({
    label: parsed.label,
    bypassWaitlist: parsed.bypassWaitlist ?? false,
    maxUses: parsed.maxUses ?? null,
    expiresAt: parsed.expiresAt?.toISOString() ?? null,
    count: parsed.count,
    createdBy: parsed.createdBy ?? null,
    sourceName: parsed.sourceName ?? null,
    eventLocation: parsed.eventLocation ?? null,
    eventDate: parsed.eventDate?.toISOString() ?? null,
    notes: parsed.notes ?? null,
  });
}

async function findRecentMatchingAcquisitionToken(
  client: AcquisitionTokenCreateClient,
  parsed: TokenCreateInput,
  since: Date
) {
  if (parsed.count !== 1) return null;
  return client.acquisitionToken.findFirst({
    where: {
      label: parsed.label,
      bypassWaitlist: parsed.bypassWaitlist ?? false,
      maxUses: parsed.maxUses ?? null,
      expiresAt: parsed.expiresAt ?? null,
      createdBy: parsed.createdBy ?? null,
      sourceName: parsed.sourceName ?? null,
      eventLocation: parsed.eventLocation ?? null,
      eventDate: parsed.eventDate ?? null,
      notes: parsed.notes ?? null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, code: true },
  });
}

export async function createAcquisitionTokens(
  input: z.input<typeof tokenCreateSchema>,
  options: { idempotencyKey?: string | null; idempotencyWindowMs?: number } = {}
) {
  const parsed = tokenCreateSchema.parse(input);
  const fingerprint = tokenCreateFingerprint(parsed);
  const lockKey = `free-tier-token-create:${options.idempotencyKey || createHash('sha256').update(fingerprint).digest('hex')}`;
  const dedupeSince = new Date(Date.now() - (options.idempotencyWindowMs ?? 5 * 60_000));
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    const existing = await findRecentMatchingAcquisitionToken(tx, parsed, dedupeSince);
    if (existing?.code) {
      return [{ token: existing.code, code: existing.code, id: existing.id, url: buildFreeTierEventLink(existing.code) }];
    }
    const tokens: { token: string; id: string; code: string; url: string }[] = [];
    for (let i = 0; i < parsed.count; i++) {
      const code = await allocateUniqueAcquisitionCode(tx);
      const tokenHash = hashToken(code);
      const row = await tx.acquisitionToken.create({
        data: {
          code,
          tokenHash,
          label: parsed.label,
          sourceName: parsed.sourceName ?? null,
          eventLocation: parsed.eventLocation ?? null,
          eventDate: parsed.eventDate ?? null,
          notes: parsed.notes ?? null,
          bypassWaitlist: parsed.bypassWaitlist ?? false,
          maxUses: parsed.maxUses ?? null,
          expiresAt: parsed.expiresAt ?? null,
          createdBy: parsed.createdBy,
        },
        select: { id: true },
      });
      tokens.push({ token: code, code, id: row.id, url: buildFreeTierEventLink(code) });
    }
    return tokens;
  });
}

export async function listAcquisitionTokensWithStats() {
  const tokens = await prisma.acquisitionToken.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      createdAt: true,
      code: true,
      label: true,
      sourceName: true,
      eventLocation: true,
      eventDate: true,
      notes: true,
      bypassWaitlist: true,
      maxUses: true,
      uses: true,
      scanCount: true,
      expiresAt: true,
      disabledAt: true,
      createdBy: true,
    },
  });
  const ids = tokens.map((t) => t.id);
  const grouped =
    ids.length === 0
      ? []
      : await prisma.freeTierApplication.groupBy({
          by: ['acquisitionTokenId', 'status'],
          where: { acquisitionTokenId: { in: ids } },
          _count: { _all: true },
        });
  const byToken = new Map<
    string,
    { signUps: number; approved: number; waitlisted: number }
  >();
  for (const row of grouped) {
    if (!row.acquisitionTokenId) continue;
    const bucket = byToken.get(row.acquisitionTokenId) ?? {
      signUps: 0,
      approved: 0,
      waitlisted: 0,
    };
    bucket.signUps += row._count._all;
    if (row.status === 'APPROVED') bucket.approved += row._count._all;
    if (row.status === 'LEAD') bucket.waitlisted += row._count._all;
    byToken.set(row.acquisitionTokenId, bucket);
  }
  return tokens.map((token) => {
    const stats = byToken.get(token.id) ?? { signUps: 0, approved: 0, waitlisted: 0 };
    return {
      ...token,
      url: token.code ? buildFreeTierEventLink(token.code) : null,
      stats: {
        scans: token.scanCount,
        signUps: stats.signUps,
        approved: stats.approved,
        waitlisted: stats.waitlisted,
        uses: token.uses,
        maxUses: token.maxUses,
      },
    };
  });
}

export async function patchAcquisitionToken(id: string, input: TokenPatchInput) {
  const parsed = tokenPatchSchema.parse(input);
  if (!Object.keys(parsed).length) return null;
  return prisma.acquisitionToken.update({
    where: { id },
    data: {
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.bypassWaitlist !== undefined ? { bypassWaitlist: parsed.bypassWaitlist } : {}),
      ...(parsed.maxUses !== undefined ? { maxUses: parsed.maxUses } : {}),
      ...(parsed.expiresAt !== undefined ? { expiresAt: parsed.expiresAt } : {}),
      ...(parsed.sourceName !== undefined ? { sourceName: parsed.sourceName } : {}),
      ...(parsed.eventLocation !== undefined ? { eventLocation: parsed.eventLocation } : {}),
      ...(parsed.eventDate !== undefined ? { eventDate: parsed.eventDate } : {}),
      ...(parsed.notes !== undefined ? { notes: parsed.notes } : {}),
    },
  });
}

export async function setAcquisitionTokenDisabled(id: string, disabled: boolean) {
  return prisma.acquisitionToken.update({
    where: { id },
    data: { disabledAt: disabled ? new Date() : null },
  });
}

export async function checkTokenValidity(token: string) {
  const row = await findAcquisitionTokenByCredential(token);
  if (!row) return { valid: false as const, reason: 'invalid' as const };
  const check = canRedeemToken({
    uses: row.uses,
    maxUses: row.maxUses ?? null,
    expiresAt: row.expiresAt ?? null,
    bypassWaitlist: row.bypassWaitlist,
    disabledAt: row.disabledAt,
  });
  if (!check.ok) return { valid: false as const, reason: check.reason };
  return { valid: true as const, label: row.label };
}

export const redeemInputSchema = waitlistInputSchema
  .omit({ middleName: true })
  .extend({
    token: z.string().min(1).max(500),
  })
  .strict();
export type RedeemInput = z.infer<typeof redeemInputSchema>;

export async function redeemToken(input: RedeemInput) {
  const parsed = redeemInputSchema.parse(input);
  const email = normalizeEmail(parsed.email);

  return prisma.$transaction(async (tx) => {
    const resolved = await findAcquisitionTokenByCredentialOn(tx, parsed.token);
    if (!resolved) return { ok: false as const, reason: 'invalid' as const };
    if (resolved.disabledAt) return { ok: false as const, reason: 'disabled' as const };
    const token = resolved;

    const existing = await tx.freeTierApplication.findUnique({
      where: { email },
      select: { id: true, status: true, acquisitionTokenId: true },
    });

    // The same person scanning the same QR twice must not burn a second use.
    const alreadyCounted = existing?.acquisitionTokenId === token.id;
    if (!alreadyCounted) {
      // Atomic claim: the cap and expiry are checked in the UPDATE itself, so
      // concurrent redemptions cannot overshoot maxUses.
      const claimed = await tx.$executeRaw`
        UPDATE "AcquisitionToken"
           SET "uses" = "uses" + 1
         WHERE "id" = ${token.id}
           AND "disabledAt" IS NULL
           AND ("maxUses" IS NULL OR "uses" < "maxUses")
           AND ("expiresAt" IS NULL OR "expiresAt" > now())`;
      if (claimed === 0) {
        const fresh = await tx.acquisitionToken.findUnique({
          where: { id: token.id },
          select: {
            uses: true,
            maxUses: true,
            expiresAt: true,
            bypassWaitlist: true,
            disabledAt: true,
          },
        });
        const gate = fresh
          ? canRedeemToken({
              uses: fresh.uses,
              maxUses: fresh.maxUses,
              expiresAt: fresh.expiresAt,
              bypassWaitlist: fresh.bypassWaitlist,
              disabledAt: fresh.disabledAt,
            })
          : ({ ok: false, reason: 'invalid' } as const);
        return { ok: false as const, reason: gate.ok ? ('exhausted' as const) : gate.reason };
      }
    }

    const now = new Date();
    if (!existing) {
      // ON CONFLICT DO NOTHING: a failed INSERT inside a transaction would abort
      // it, and losing a race for the same email just means the other writer won.
      await tx.freeTierApplication.createMany({
        data: [
          {
            name: parsed.name,
            email,
            schoolName: parsed.schoolName,
            location: parsed.location,
            gradeLevel: parsed.gradeLevel,
            acquisitionTokenId: token.id,
            status: token.bypassWaitlist ? 'INVITED' : 'LEAD',
            releasedAt: token.bypassWaitlist ? now : null,
          },
        ],
        skipDuplicates: true,
      });
    } else {
      // Never overwrite an applicant's details or move them backwards. The only
      // change a bypass token may make is LEAD -> INVITED (a legal transition),
      // and the token is recorded as the source if there was none.
      const data: { status?: FreeTierApplicationStatus; releasedAt?: Date; acquisitionTokenId?: string } = {};
      if (token.bypassWaitlist && existing.status === 'LEAD') {
        assertTransition('LEAD', 'INVITED');
        data.status = 'INVITED';
        data.releasedAt = now;
      }
      if (!existing.acquisitionTokenId) data.acquisitionTokenId = token.id;
      if (Object.keys(data).length > 0) {
        await tx.freeTierApplication.update({ where: { id: existing.id }, data });
      }
    }
    return { ok: true as const, bypassWaitlist: token.bypassWaitlist };
  });
}

export const releaseBatchSchema = z
  .object({
    applicationIds: z.array(z.string().min(1).max(200)).min(1).max(1000),
  })
  .strict();
export type ReleaseBatchInput = z.infer<typeof releaseBatchSchema>;

export async function releaseBatch(input: ReleaseBatchInput, audit?: TesterAuditActor) {
  const parsed = releaseBatchSchema.parse(input);
  const cap = getFreeTierReleaseCap();
  const ids = [...new Set(parsed.applicationIds)];
  const activeStatuses: FreeTierApplicationStatus[] = [
    'INVITED',
    'ACCOUNT_CREATED',
    'ADMIN_SUBMITTED',
    'SENT',
    'MANUAL_REVIEW',
    'APPROVED',
  ];
  // One batch at a time: the cap check and the update must be atomic or two
  // concurrent batches would each see the same headroom and overshoot it.
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
    const current = await tx.freeTierApplication.count({
      where: { OR: [{ releasedAt: { not: null } }, { status: { in: activeStatuses } }] },
    });
    const remaining = Math.max(0, cap - current);
    // Only waitlisted leads can be released; already-released or unknown ids do
    // not use up headroom and are reported separately.
    const leads = await tx.freeTierApplication.findMany({
      where: { id: { in: ids }, status: 'LEAD' },
      select: { id: true },
    });
    const leadIds = new Set(leads.map((l) => l.id));
    const eligible = ids.filter((id) => leadIds.has(id));
    const toRelease = eligible.slice(0, remaining);
    let released = 0;
    if (toRelease.length > 0) {
      if (audit) {
        for (const id of toRelease) {
          const updated = await tx.freeTierApplication.updateMany({
            where: { id, status: 'LEAD' }, data: { status: 'INVITED', releasedAt: new Date() },
          });
          released += updated.count;
          if (updated.count) await recordTesterAudit(tx, audit, id, { status: 'INVITED' });
        }
      } else {
        const updated = await tx.freeTierApplication.updateMany({
          where: { id: { in: toRelease }, status: 'LEAD' },
          data: { status: 'INVITED', releasedAt: new Date() },
        });
        released = updated.count;
      }
    }
    return {
      released,
      refused: eligible.length - toRelease.length,
      skipped: ids.length - eligible.length,
      cappedAt: cap,
    };
  });
}
