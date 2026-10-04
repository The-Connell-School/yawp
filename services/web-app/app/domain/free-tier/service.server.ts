import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '~/utils/db.server';
import type { FreeTierApplicationStatus } from '@app/prisma/generated/prisma/index';
import { assertTransition } from './state';

export const FREE_TIER_RELEASE_CAP =
  Number(process.env.FREE_TIER_RELEASE_CAP || '100');

export const waitlistInputSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().email().max(320),
    schoolName: z.string().trim().min(1).max(200),
    location: z.string().trim().min(1).max(200),
    gradeLevel: z.string().trim().min(1).max(50),
    // Honeypot field to deter bots
    middleName: z.string().max(0).optional().default(''),
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
}) {
  const now = Date.now();
  if (record.expiresAt && record.expiresAt.getTime() <= now) return { ok: false, reason: 'expired' as const };
  if (record.maxUses != null && record.uses >= record.maxUses) return { ok: false, reason: 'exhausted' as const };
  return { ok: true as const, reason: null as const };
}

export async function submitWaitlist(input: WaitlistInput) {
  const parsed = waitlistInputSchema.parse(input);
  if (parsed.middleName) return { ok: true as const }; // honeypot: do nothing
  const email = normalizeEmail(parsed.email);
  await prisma.freeTierApplication.upsert({
    where: { email },
    create: {
      name: parsed.name,
      email,
      schoolName: parsed.schoolName,
      location: parsed.location,
      gradeLevel: parsed.gradeLevel,
      status: 'LEAD',
    },
    update: {
      // keep idempotent: do not change status on resubmit; update non-identifying info
      name: parsed.name,
      schoolName: parsed.schoolName,
      location: parsed.location,
      gradeLevel: parsed.gradeLevel,
    },
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
    bypassWaitlist: false,
  });
  if (!check.ok) return { valid: false as const, reason: check.reason };
  return { valid: true as const, label: row.label };
}

export const redeemInputSchema = waitlistInputSchema
  .omit({ middleName: true })
  .extend({
    token: z.string().min(1).max(500),
    // optional idempotency: if email already exists, we will update and advance if applicable
  })
  .strict();
export type RedeemInput = z.infer<typeof redeemInputSchema>;

export async function redeemToken(input: RedeemInput) {
  const parsed = redeemInputSchema.parse(input);
  const tokenHash = hashToken(parsed.token);
  const token = await prisma.acquisitionToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      label: true,
      uses: true,
      maxUses: true,
      expiresAt: true,
      bypassWaitlist: true,
    },
  });
  if (!token) return { ok: false as const, reason: 'invalid' as const };
  const gate = canRedeemToken({
    uses: token.uses,
    maxUses: token.maxUses ?? null,
    expiresAt: token.expiresAt ?? null,
    bypassWaitlist: token.bypassWaitlist,
  });
  if (!gate.ok) return { ok: false as const, reason: gate.reason };

  const email = normalizeEmail(parsed.email);
  const now = new Date();

  const nextStatus: FreeTierApplicationStatus =
    token.bypassWaitlist ? 'INVITED' : 'LEAD';

  const app = await prisma.freeTierApplication.upsert({
    where: { email },
    create: {
      name: parsed.name,
      email,
      schoolName: parsed.schoolName,
      location: parsed.location,
      gradeLevel: parsed.gradeLevel,
      acquisitionTokenId: token.id,
      status: nextStatus,
      releasedAt: token.bypassWaitlist ? now : null,
    },
    update: {
      name: parsed.name,
      schoolName: parsed.schoolName,
      location: parsed.location,
      gradeLevel: parsed.gradeLevel,
      acquisitionTokenId: token.id,
      status: nextStatus === 'INVITED' ? 'INVITED' : undefined,
      releasedAt: token.bypassWaitlist ? now : undefined,
    },
    select: { id: true, status: true, email: true },
  });

  // increment uses
  await prisma.acquisitionToken.update({
    where: { tokenHash },
    data: { uses: { increment: 1 } },
  });

  return { ok: true as const, applicationId: app.id, status: app.status };
}

export const releaseBatchSchema = z
  .object({
    applicationIds: z.array(z.string().min(1).max(200)).min(1).max(1000),
  })
  .strict();
export type ReleaseBatchInput = z.infer<typeof releaseBatchSchema>;

export async function releaseBatch(input: ReleaseBatchInput) {
  const parsed = releaseBatchSchema.parse(input);
  // Count current active invites/flows towards cap
  const activeStatuses: FreeTierApplicationStatus[] = [
    'INVITED',
    'ACCOUNT_CREATED',
    'ADMIN_SUBMITTED',
    'SENT',
    'MANUAL_REVIEW',
    'APPROVED',
  ];
  const current = await prisma.freeTierApplication.count({
    where: {
      OR: [{ releasedAt: { not: null } }, { status: { in: activeStatuses } }],
    },
  });
  const remaining = Math.max(0, FREE_TIER_RELEASE_CAP - current);
  if (remaining <= 0) return { released: 0, refused: parsed.applicationIds.length, cappedAt: FREE_TIER_RELEASE_CAP };
  const slice = parsed.applicationIds.slice(0, remaining);
  const now = new Date();
  const updated = await prisma.freeTierApplication.updateMany({
    where: { id: { in: slice }, status: { in: ['LEAD', 'INVITED'] } },
    data: { status: 'INVITED', releasedAt: now },
  });
  return { released: updated.count, refused: parsed.applicationIds.length - slice.length, cappedAt: FREE_TIER_RELEASE_CAP };
}

