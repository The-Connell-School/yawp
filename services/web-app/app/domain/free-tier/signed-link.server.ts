import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { hashToken } from './service.server';

export const FREE_TIER_LINK_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const RELEASE_LINK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function linkSecrets() {
  const raw = process.env.FREE_TIER_LINK_HMAC_SECRET?.trim();
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
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
  | { ok: false; reason: 'invalid' | 'expired' | 'used' | 'purpose_mismatch' };

export async function consumeSignedLink(args: {
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
  return prisma.$transaction(async (tx) => {
    const row = await tx.freeTierSignedLink.findUnique({
      where: { id: payload.linkId },
      select: { id: true, applicationId: true, purpose: true, tokenHash: true, expiresAt: true, usedAt: true },
    });
    if (!row || row.applicationId !== payload.applicationId || row.purpose !== args.expectedPurpose) {
      return { ok: false as const, reason: 'invalid' as const };
    }
    if (row.tokenHash !== tokenHash) return { ok: false as const, reason: 'invalid' as const };
    if (row.expiresAt.getTime() < Date.now()) return { ok: false as const, reason: 'expired' as const };
    if (row.usedAt) return { ok: false as const, reason: 'used' as const };
    await tx.freeTierSignedLink.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    return {
      ok: true as const,
      applicationId: row.applicationId,
      purpose: row.purpose,
      linkId: row.id,
    };
  });
}

/** Validate without consuming (for GET loaders). */
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
  if (row.usedAt) return { ok: false, reason: 'used' };
  return { ok: true, applicationId: row.applicationId, purpose: row.purpose, linkId: row.id };
}
