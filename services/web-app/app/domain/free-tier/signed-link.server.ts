import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { hashToken } from './service.server';
import { assertFreeTierRuntimeConfigured } from './free-tier-config.server';

export const FREE_TIER_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const RELEASE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function linkSecrets() {
  const raw = process.env.FREE_TIER_LINK_HMAC_SECRET?.trim();
  if (raw) return raw.split(',').map((s) => s.trim()).filter(Boolean);
  // PR previews share PREVIEW_ACCESS_SECRET across the stack; use it so signed
  // free-tier links work without a separate secret rotation.
  if (process.env.YAWP_ENVIRONMENT === 'preview') {
    const preview = process.env.PREVIEW_ACCESS_SECRET?.trim();
    if (preview) return [preview];
  }
  return [];
}

export function isFreeTierLinkSigningConfigured() {
  return linkSecrets().length > 0;
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export type SignedLinkPayload = {
  v: 1;
  purpose: FreeTierSignedLinkPurpose;
  applicationId: string;
  linkId: string;
  exp: number;
};

function encodeToken(payload: SignedLinkPayload, secret: string) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(body, secret);
  return `${body}.${sig}`;
}

export function applicationIdFromSignedToken(token: string): string | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const decoded = decodeToken(`${segments[0]}.${segments[1]}`);
  return decoded?.payload.applicationId ?? null;
}

function decodeToken(token: string): { payload: SignedLinkPayload; secret: string } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  for (const secret of linkSecrets()) {
    const expected = signPayload(body, secret);
    try {
      if (
        expected.length === sig.length &&
        timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
      ) {
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as SignedLinkPayload;
        if (payload?.v !== 1 || !payload.purpose || !payload.applicationId || !payload.linkId || !payload.exp) {
          return null;
        }
        return { payload, secret };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function mintSignedLink(args: {
  applicationId: string;
  purpose: FreeTierSignedLinkPurpose;
  ttlMs?: number;
  tx?: Prisma.TransactionClient;
}) {
  assertFreeTierRuntimeConfigured();
  const secrets = linkSecrets();
  if (!secrets.length) throw new Error('FREE_TIER_LINK_HMAC_SECRET is not configured');
  const secret = secrets[0]!;
  const linkId = randomBytes(12).toString('base64url');
  const expiresAt = new Date(Date.now() + (args.ttlMs ?? FREE_TIER_LINK_TTL_MS));
  const opaque = randomBytes(24).toString('base64url');
  const tokenHash = hashToken(opaque);
  const db = args.tx ?? prisma;
  const row = await db.freeTierSignedLink.create({
    data: {
      id: linkId,
      applicationId: args.applicationId,
      purpose: args.purpose,
      tokenHash,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });
  const payload: SignedLinkPayload = {
    v: 1,
    purpose: args.purpose,
    applicationId: args.applicationId,
    linkId: row.id,
    exp: row.expiresAt.getTime(),
  };
  const signed = encodeToken(payload, secret);
  return { token: `${signed}.${opaque}`, linkId: row.id, expiresAt: row.expiresAt };
}

export type ConsumeLinkResult =
  | { ok: true; applicationId: string; purpose: FreeTierSignedLinkPurpose; linkId: string }
  | {
      ok: false;
      reason: 'invalid' | 'expired' | 'used' | 'purpose_mismatch' | 'superseded';
    };

function parseSignedLinkToken(
  token: string,
  expectedPurpose: FreeTierSignedLinkPurpose
):
  | { ok: true; payload: SignedLinkPayload; tokenHash: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'purpose_mismatch' } {
  const segments = token.split('.');
  if (segments.length !== 3) return { ok: false, reason: 'invalid' };
  const signedPart = `${segments[0]}.${segments[1]}`;
  const opaque = segments[2]!;
  const decoded = decodeToken(signedPart);
  if (!decoded) return { ok: false, reason: 'invalid' };
  const { payload } = decoded;
  if (payload.purpose !== expectedPurpose) return { ok: false, reason: 'purpose_mismatch' };
  if (payload.exp < Date.now()) return { ok: false, reason: 'expired' };
  return { ok: true, payload, tokenHash: hashToken(opaque) };
}

/** Atomically mark a link used inside an open transaction (rolls back with caller). */
export async function claimSignedLinkInTransaction(
  tx: Prisma.TransactionClient,
  args: { token: string; expectedPurpose: FreeTierSignedLinkPurpose }
): Promise<ConsumeLinkResult> {
  const parsed = parseSignedLinkToken(args.token, args.expectedPurpose);
  if (!parsed.ok) return parsed;
  const { payload, tokenHash } = parsed;
  const now = new Date();
  const claimed = await tx.freeTierSignedLink.updateMany({
    where: {
      id: payload.linkId,
      applicationId: payload.applicationId,
      purpose: args.expectedPurpose,
      tokenHash,
      usedAt: null,
      expiresAt: { gt: now },
    },
    data: { usedAt: now },
  });
  if (claimed.count === 1) {
    return {
      ok: true,
      applicationId: payload.applicationId,
      purpose: args.expectedPurpose,
      linkId: payload.linkId,
    };
  }
  const row = await tx.freeTierSignedLink.findUnique({
    where: { id: payload.linkId },
    select: { usedAt: true, expiresAt: true, tokenHash: true, applicationId: true, purpose: true },
  });
  if (!row || row.applicationId !== payload.applicationId || row.purpose !== args.expectedPurpose) {
    return { ok: false, reason: 'invalid' };
  }
  if (row.tokenHash !== tokenHash) return { ok: false, reason: 'invalid' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.usedAt) return { ok: false, reason: 'used' };
  return { ok: false, reason: 'invalid' };
}

export async function consumeSignedLink(args: {
  token: string;
  expectedPurpose: FreeTierSignedLinkPurpose;
}): Promise<ConsumeLinkResult> {
  return prisma.$transaction(async (tx) => claimSignedLinkInTransaction(tx, args));
}

/** Validate without consuming (for GET loaders). */
export async function supersededApproveLinkReason(
  applicationId: string,
  linkId: string
): Promise<'superseded' | null> {
  const pending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { signedLinkId: true },
  });
  if (!pending?.signedLinkId || pending.signedLinkId === linkId) return null;
  return 'superseded';
}

export async function invalidateOpenAdminApprovalLinks(
  tx: Prisma.TransactionClient,
  applicationId: string,
  options?: { exceptLinkIds?: string[] }
) {
  const now = new Date();
  const exceptLinkIds = options?.exceptLinkIds?.filter(Boolean) ?? [];
  await tx.freeTierSignedLink.updateMany({
    where: {
      applicationId,
      purpose: { in: ['ADMIN_APPROVE', 'ADMIN_NOT_RIGHT_PERSON'] },
      usedAt: null,
      expiresAt: { gt: now },
      ...(exceptLinkIds.length ? { id: { notIn: exceptLinkIds } } : {}),
    },
    data: { usedAt: now },
  });
}

/** Discard freshly minted links when an email send fails before commit. */
export async function abandonMintedSignedLinks(linkIds: string[]) {
  const ids = linkIds.filter(Boolean);
  if (!ids.length) return;
  const now = new Date();
  await prisma.freeTierSignedLink.updateMany({
    where: { id: { in: ids }, usedAt: null },
    data: { usedAt: now },
  });
}

export async function peekSignedLink(args: {
  token: string;
  expectedPurpose: FreeTierSignedLinkPurpose;
}): Promise<ConsumeLinkResult> {
  const segments = args.token.split('.');
  if (segments.length !== 3) return { ok: false, reason: 'invalid' };
  const signedPart = `${segments[0]}.${segments[1]}`;
  const opaque = segments[2]!;
  const decoded = decodeToken(signedPart);
  if (!decoded) return { ok: false, reason: 'invalid' };
  const { payload } = decoded;
  if (payload.purpose !== args.expectedPurpose) return { ok: false, reason: 'purpose_mismatch' };
  if (payload.exp < Date.now()) return { ok: false, reason: 'expired' };
  const tokenHash = hashToken(opaque);
  const row = await prisma.freeTierSignedLink.findUnique({
    where: { id: payload.linkId },
    select: { id: true, applicationId: true, purpose: true, tokenHash: true, expiresAt: true, usedAt: true },
  });
  if (!row || row.applicationId !== payload.applicationId || row.purpose !== args.expectedPurpose) {
    return { ok: false, reason: 'invalid' };
  }
  if (row.tokenHash !== tokenHash) return { ok: false, reason: 'invalid' };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' };
  if (row.usedAt) {
    if (
      args.expectedPurpose === 'ADMIN_APPROVE' &&
      (await supersededApproveLinkReason(row.applicationId, row.id)) === 'superseded'
    ) {
      return { ok: false, reason: 'superseded' };
    }
    return { ok: false, reason: 'used' };
  }
  if (
    args.expectedPurpose === 'ADMIN_APPROVE' &&
    (await supersededApproveLinkReason(row.applicationId, row.id)) === 'superseded'
  ) {
    return { ok: false, reason: 'superseded' };
  }
  return { ok: true, applicationId: row.applicationId, purpose: row.purpose, linkId: row.id };
}
