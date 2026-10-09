import { createHmac, createHash, randomBytes } from 'node:crypto';
import type { E2EPrismaClient } from '../prisma-client';

const RELEASE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function linkSecret() {
  const raw = process.env.FREE_TIER_LINK_HMAC_SECRET?.trim();
  if (!raw) throw new Error('FREE_TIER_LINK_HMAC_SECRET is required for E2E link minting');
  return raw.split(',')[0]!;
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function signPayload(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function encodeToken(
  payload: {
    v: 1;
    purpose: 'RELEASE' | 'ADMIN_APPROVE' | 'ADMIN_NOT_RIGHT_PERSON';
    applicationId: string;
    linkId: string;
    exp: number;
  },
  secret: string
) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = signPayload(body, secret);
  return `${body}.${sig}`;
}

export async function mintFreeTierLinkForE2E(
  prisma: E2EPrismaClient,
  args: {
    applicationId: string;
    purpose: 'RELEASE' | 'ADMIN_APPROVE' | 'ADMIN_NOT_RIGHT_PERSON';
    ttlMs?: number;
  }
) {
  const secret = linkSecret();
  const linkId = randomBytes(12).toString('base64url');
  const expiresAt = new Date(Date.now() + (args.ttlMs ?? RELEASE_TTL_MS));
  const opaque = randomBytes(24).toString('base64url');
  const tokenHash = hashToken(opaque);
  await prisma.freeTierSignedLink.create({
    data: {
      id: linkId,
      applicationId: args.applicationId,
      purpose: args.purpose,
      tokenHash,
      expiresAt,
    },
  });
  const payload = {
    v: 1 as const,
    purpose: args.purpose,
    applicationId: args.applicationId,
    linkId,
    exp: expiresAt.getTime(),
  };
  const signed = encodeToken(payload, secret);
  return { token: `${signed}.${opaque}`, linkId };
}
