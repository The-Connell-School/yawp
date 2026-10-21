import { prisma } from '~/utils/db.server';
import {
  applicationIdFromSignedToken,
  peekSignedLink,
  type ConsumeLinkResult,
} from './signed-link.server';
import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import { normalizeEmail } from './service.server';

export type FreeTierAdminTerminalReason = 'already_approved' | 'declined';

export type FreeTierAdminTerminalGate = {
  reason: FreeTierAdminTerminalReason;
  schoolName: string;
};

export async function fetchFreeTierApplicationTerminalGate(
  applicationId: string
): Promise<FreeTierAdminTerminalGate | null> {
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: applicationId },
    select: { status: true, schoolName: true },
  });
  if (!app) return null;
  if (app.status === 'APPROVED') {
    return { reason: 'already_approved', schoolName: app.schoolName };
  }
  if (app.status === 'REJECTED' || app.status === 'EXPIRED') {
    return { reason: 'declined', schoolName: app.schoolName };
  }
  return null;
}

function linkIdFromSignedToken(token: string): string | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  const body = segments[0];
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as {
      linkId?: string;
    };
    return payload.linkId ?? null;
  } catch {
    return null;
  }
}

/** True when this not-right-person link was consumed by a successful forward. */
export async function forwardAlreadySucceededForToken(token: string): Promise<boolean> {
  const applicationId = applicationIdFromSignedToken(token);
  const linkId = linkIdFromSignedToken(token);
  if (!applicationId || !linkId) return false;
  const row = await prisma.freeTierSignedLink.findUnique({
    where: { id: linkId },
    select: { usedAt: true, applicationId: true, purpose: true },
  });
  if (
    !row?.usedAt ||
    row.applicationId !== applicationId ||
    row.purpose !== 'ADMIN_NOT_RIGHT_PERSON'
  ) {
    return false;
  }
  const redirected = await prisma.freeTierAdminApproval.findFirst({
    where: {
      applicationId,
      status: 'REDIRECTED',
      decidedAt: { gte: new Date(row.usedAt.getTime() - 5_000) },
    },
    select: { id: true },
  });
  return !!redirected;
}

/** Idempotent replay only when the same forward payload is resubmitted. */
export async function forwardIdempotentReplay(args: {
  token: string;
  newAdminName: string;
  newAdminEmail: string;
}): Promise<boolean> {
  if (!(await forwardAlreadySucceededForToken(args.token))) return false;
  const applicationId = applicationIdFromSignedToken(args.token);
  if (!applicationId) return false;
  const pending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { adminName: true, adminEmail: true },
  });
  if (!pending) return false;
  return (
    pending.adminName.trim() === args.newAdminName.trim() &&
    normalizeEmail(pending.adminEmail) === normalizeEmail(args.newAdminEmail)
  );
}

export async function resolveAdminLinkTerminalGate(args: {
  token: string;
  peek: ConsumeLinkResult;
}): Promise<FreeTierAdminTerminalGate | null> {
  const applicationId = args.peek.ok
    ? args.peek.applicationId
    : applicationIdFromSignedToken(args.token);
  if (!applicationId) return null;
  return fetchFreeTierApplicationTerminalGate(applicationId);
}

export async function peekAdminSignedLinkForLoader(args: {
  token: string;
  expectedPurpose: FreeTierSignedLinkPurpose;
}): Promise<ConsumeLinkResult> {
  return peekSignedLink(args);
}
