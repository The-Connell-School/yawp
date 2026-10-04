import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import type { FreeTierApplicationStatus } from '@app/prisma';
import { assertTransition } from './state';

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

export function canRedeemToken(record: {
  uses: number;
  maxUses: number | null;
  expiresAt: Date | null;
  bypassWaitlist: boolean;
}): { ok: true; reason: null } | { ok: false; reason: 'expired' | 'exhausted' } {
  const now = Date.now();
  if (record.expiresAt && record.expiresAt.getTime() <= now) return { ok: false, reason: 'expired' };
  if (record.maxUses != null && record.uses >= record.maxUses) return { ok: false, reason: 'exhausted' };
  return { ok: true, reason: null };
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
    expiresAt: z
      .string()
      .datetime()
      .transform((v) => new Date(v))
      .optional(),
    count: z.number().int().min(1).max(100).default(1),
    createdBy: z.string().trim().max(200).optional(),
  })
  .strict();
export type TokenCreateInput = z.infer<typeof tokenCreateSchema>;

export async function createAcquisitionTokens(input: TokenCreateInput) {
  const parsed = tokenCreateSchema.parse(input);
  const tokens: { token: string; id: string }[] = [];
  for (let i = 0; i < parsed.count; i++) {
    const token = generateToken();
    const tokenHash = hashToken(token);
    const row = await prisma.acquisitionToken.create({
      data: {
        tokenHash,
        label: parsed.label,
        bypassWaitlist: parsed.bypassWaitlist ?? false,
        maxUses: parsed.maxUses ?? null,
        expiresAt: parsed.expiresAt ?? null,
        createdBy: parsed.createdBy,
      },
      select: { id: true },
    });
    tokens.push({ token, id: row.id });
  }
  return tokens;
}

export async function checkTokenValidity(token: string) {
  // Lookup is by sha256(token) on a unique index; the plaintext is never
  // compared in application code, so there is no secret-dependent comparison.
  const tokenHash = hashToken(token);
  const row = await prisma.acquisitionToken.findUnique({
    where: { tokenHash },
    select: { id: true, label: true, uses: true, maxUses: true, expiresAt: true, bypassWaitlist: true },
  });
  if (!row) return { valid: false as const, reason: 'invalid' as const };
  const check = canRedeemToken({
    uses: row.uses,
    maxUses: row.maxUses ?? null,
    expiresAt: row.expiresAt ?? null,
    bypassWaitlist: row.bypassWaitlist,
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
  const tokenHash = hashToken(parsed.token);
  const email = normalizeEmail(parsed.email);

  return prisma.$transaction(async (tx) => {
    const token = await tx.acquisitionToken.findUnique({
      where: { tokenHash },
      select: { id: true, uses: true, maxUses: true, expiresAt: true, bypassWaitlist: true },
    });
    if (!token) return { ok: false as const, reason: 'invalid' as const };

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
           AND ("maxUses" IS NULL OR "uses" < "maxUses")
           AND ("expiresAt" IS NULL OR "expiresAt" > now())`;
      if (claimed === 0) {
        const fresh = await tx.acquisitionToken.findUnique({
          where: { id: token.id },
          select: { uses: true, maxUses: true, expiresAt: true, bypassWaitlist: true },
        });
        const gate = fresh
          ? canRedeemToken({ uses: fresh.uses, maxUses: fresh.maxUses, expiresAt: fresh.expiresAt, bypassWaitlist: fresh.bypassWaitlist })
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

export async function releaseBatch(input: ReleaseBatchInput) {
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
      const updated = await tx.freeTierApplication.updateMany({
        where: { id: { in: toRelease }, status: 'LEAD' },
        data: { status: 'INVITED', releasedAt: new Date() },
      });
      released = updated.count;
    }
    return {
      released,
      refused: eligible.length - toRelease.length,
      skipped: ids.length - eligible.length,
      cappedAt: cap,
    };
  });
}
