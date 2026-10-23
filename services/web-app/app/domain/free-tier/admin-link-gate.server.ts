import { prisma } from '~/utils/db.server';
import {
  applicationIdFromSignedToken,
  peekSignedLink,
  type ConsumeLinkResult,
} from './signed-link.server';
import { applicationIdForAdminLinkNaming } from './admin-link-known-request.server';
import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import type { FreeTierSignedLinkPurpose } from '@app/prisma';
import { normalizeEmail } from './service.server';

export type FreeTierAdminTerminalReason = 'already_approved' | 'declined';

export type FreeTierAdminTerminalGate = {
  reason: FreeTierAdminTerminalReason;
  schoolName: string;
  teacherName: string;
};

export async function fetchFreeTierApplicationTerminalGate(
  applicationId: string
): Promise<FreeTierAdminTerminalGate | null> {
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: applicationId },
    select: { status: true, schoolName: true, name: true },
  });
  if (!app) return null;
  if (app.status === 'APPROVED') {
    return {
      reason: 'already_approved',
      schoolName: app.schoolName,
      teacherName: app.name,
    };
  }
  if (app.status === 'REJECTED' || app.status === 'EXPIRED') {
    return {
      reason: 'declined',
      schoolName: app.schoolName,
      teacherName: app.name,
    };
  }
  return null;
}

async function supersededLinkReplacedVariant(
  applicationId: string,
  token: string
): Promise<FreeTierAdminLinkReplacedVariant> {
  const linkId = linkIdFromSignedToken(token);
  if (!linkId) return 'resent';
  const link = await prisma.freeTierSignedLink.findUnique({
    where: { id: linkId },
    select: { createdAt: true },
  });
  if (!link) return 'resent';
  const redirected = await prisma.freeTierAdminApproval.findFirst({
    where: {
      applicationId,
      status: 'REDIRECTED',
      decidedAt: { gte: link.createdAt },
    },
    select: { id: true },
  });
  return redirected ? 'forwarded' : 'resent';
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
export async function forwardAlreadySucceededForToken(
  token: string
): Promise<boolean> {
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
  expectedPurpose: FreeTierSignedLinkPurpose;
}): Promise<FreeTierAdminTerminalGate | null> {
  const applicationId = await applicationIdForAdminLinkNaming(
    args.token,
    args.peek,
    args.expectedPurpose
  );
  if (!applicationId) return null;
  return fetchFreeTierApplicationTerminalGate(applicationId);
}

export async function peekAdminSignedLinkForLoader(args: {
  token: string;
  expectedPurpose: FreeTierSignedLinkPurpose;
}): Promise<ConsumeLinkResult> {
  return peekSignedLink(args);
}

export type FreeTierAdminLinkReplacedVariant = 'forwarded' | 'resent';

export type FreeTierAdminLinkReplacedGate = {
  reason: 'link_replaced';
  variant: FreeTierAdminLinkReplacedVariant;
  schoolName: string;
  teacherName: string;
};

/** After forward invalidates an admin link, while the request is still open. */
export async function resolveAdminLinkReplacedGate(args: {
  token: string;
  peek: ConsumeLinkResult;
  expectedPurpose: FreeTierSignedLinkPurpose;
}): Promise<FreeTierAdminLinkReplacedGate | null> {
  if (args.peek.ok) return null;
  if (args.peek.reason !== 'superseded' && args.peek.reason !== 'used') {
    return null;
  }
  const applicationId = await applicationIdForAdminLinkNaming(
    args.token,
    args.peek,
    args.expectedPurpose
  );
  if (!applicationId) return null;
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: applicationId },
    select: { name: true, schoolName: true, status: true },
  });
  if (!app) return null;
  if (['APPROVED', 'REJECTED', 'EXPIRED'].includes(app.status)) return null;

  if (args.peek.reason === 'superseded') {
    const variant = await supersededLinkReplacedVariant(applicationId, args.token);
    return {
      reason: 'link_replaced',
      variant,
      teacherName: app.name,
      schoolName: app.schoolName,
    };
  }

  if (await forwardAlreadySucceededForToken(args.token)) {
    return {
      reason: 'link_replaced',
      variant: 'forwarded',
      teacherName: app.name,
      schoolName: app.schoolName,
    };
  }

  const linkId = linkIdFromSignedToken(args.token);
  if (!linkId) return null;
  const link = await prisma.freeTierSignedLink.findUnique({
    where: { id: linkId },
    select: { usedAt: true },
  });
  if (!link?.usedAt) return null;
  const redirected = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId, status: 'REDIRECTED' },
    orderBy: { decidedAt: 'desc' },
    select: { decidedAt: true },
  });
  if (redirected?.decidedAt && redirected.decidedAt >= link.usedAt) {
    return {
      reason: 'link_replaced',
      variant: 'forwarded',
      teacherName: app.name,
      schoolName: app.schoolName,
    };
  }
  return null;
}
