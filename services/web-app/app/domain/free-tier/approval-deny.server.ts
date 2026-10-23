import { prisma } from '~/utils/db.server';
import { lockApprovalApplication } from './approval-lock.server';
import {
  applicationIdFromSignedToken,
  claimSignedLinkInTransaction,
  invalidateOpenAdminApprovalLinks,
  peekSignedLink,
} from './signed-link.server';
import { fetchFreeTierApplicationTerminalGate } from './admin-link-gate.server';
import { applicationIdForAdminLinkNaming } from './admin-link-known-request.server';
import { hashRequestMeta } from './approval-flow.server';
import {
  flushTeacherDenyEmail,
  isApprovalV2Enabled,
  queueTeacherDenyEmailInTransaction,
} from './approval-v2.server';
import { ADMIN_REDIRECT_CHAIN_CAP } from './admin-email-rules.server';
import { teacherAskAnotherHint } from './admin-deny-copy';
import { applyYawpE2eDenyStub } from './e2e-stub.server';

const fail = (reason: string) => ({ ok: false as const, reason });

function linkIdFromSignedToken(token: string): string | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(segments[0]!, 'base64url').toString()) as {
      linkId?: string;
    };
    return payload.linkId ?? null;
  } catch {
    return null;
  }
}

export async function resolveAdminDenyAnsweredGate(args: {
  token: string;
  purpose?: 'ADMIN_APPROVE' | 'ADMIN_NOT_RIGHT_PERSON';
}) {
  const purpose = args.purpose ?? 'ADMIN_APPROVE';
  const peek = await peekSignedLink({ token: args.token, expectedPurpose: purpose });
  if (peek.ok) return null;
  const appId = await applicationIdForAdminLinkNaming(
    args.token,
    peek,
    purpose
  );
  if (!appId) return null;
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: appId },
    select: { name: true, schoolName: true },
  });
  if (!app) return null;
  const terminal = await fetchFreeTierApplicationTerminalGate(appId);
  if (terminal) return terminal;

  const linkId = linkIdFromSignedToken(args.token);
  if (!linkId) return null;

  const deniedForLink = await prisma.freeTierAdminApproval.findFirst({
    where: {
      applicationId: appId,
      status: 'DENIED',
      signedLinkId: linkId,
    },
    select: { decidedAt: true },
  });
  if (!deniedForLink?.decidedAt) return null;
  return {
    reason: 'admin_denied' as const,
    teacherName: app.name,
    schoolName: app.schoolName,
    decidedAt: deniedForLink.decidedAt,
  };
}

export type DenySchoolAdminApprovalResult =
  | {
      ok: true;
      idempotent?: true;
      notify?: {
        approvalId: string;
        applicationId: string;
        teacherEmail: string;
        teacherName: string;
        schoolName: string;
        adminName: string;
        chainCapReached: boolean;
      };
    }
  | { ok: false; reason: string; teacherName?: string; schoolName?: string; status?: string };

export async function denySchoolAdminApproval(args: {
  token: string;
  reason?: string;
  request: Request;
}): Promise<DenySchoolAdminApprovalResult> {
  const stubbed = await applyYawpE2eDenyStub(args.request);
  if (stubbed) return stubbed;
  const trimmedReason = args.reason?.trim().slice(0, 2000) || null;
  const earlyAppId = applicationIdFromSignedToken(args.token);
  if (earlyAppId) {
    const terminal = await fetchFreeTierApplicationTerminalGate(earlyAppId);
    if (terminal?.reason === 'already_approved') {
      return { ok: true, idempotent: true };
    }
    if (terminal) return { ok: false, ...terminal };
    const answered = await resolveAdminDenyAnsweredGate({ token: args.token });
    if (answered && answered.reason === 'admin_denied') {
      return { ok: true, idempotent: true };
    }
  }

  const meta = hashRequestMeta(args.request);
  let result: DenySchoolAdminApprovalResult;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (earlyAppId) await lockApprovalApplication(tx, earlyAppId);

      const consumed = await claimSignedLinkInTransaction(tx, {
        token: args.token,
        expectedPurpose: 'ADMIN_APPROVE',
      });
      if (!consumed.ok) {
        if (consumed.reason === 'used') {
          const replay = await resolveAdminDenyAnsweredGate({ token: args.token });
          if (replay?.reason === 'admin_denied') {
            return { ok: true as const, idempotent: true as const };
          }
        }
        return consumed;
      }

      const app = await tx.freeTierApplication.findUnique({
        where: { id: consumed.applicationId },
        select: {
          id: true,
          status: true,
          email: true,
          name: true,
          schoolName: true,
          userId: true,
          organizationId: true,
          adminRedirectCount: true,
        },
      });
      if (!app) return fail('not_found');
      if (app.status === 'APPROVED') return { ok: true as const, idempotent: true as const };
      if (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW') {
        return { ok: false as const, reason: 'illegal_state' as const, status: app.status };
      }

      const v2 = await isApprovalV2Enabled(app, tx);
      if (!v2) return fail('not_allowed');

      const pending = await tx.freeTierAdminApproval.findFirst({
        where: {
          applicationId: app.id,
          signedLinkId: consumed.linkId,
          status: 'PENDING',
        },
        select: {
          id: true,
          adminName: true,
          adminEmail: true,
        },
      });
      if (!pending) {
        const denied = await tx.freeTierAdminApproval.findFirst({
          where: {
            applicationId: app.id,
            signedLinkId: consumed.linkId,
            status: 'DENIED',
          },
          select: { id: true },
        });
        if (denied) return { ok: true as const, idempotent: true as const };
        return fail('superseded');
      }

      const now = new Date();
      await tx.freeTierAdminApproval.update({
        where: { id: pending.id },
        data: {
          status: 'DENIED',
          decidedAt: now,
          denyReason: trimmedReason,
          autoRemindersStopped: true,
          stopReason: 'denied',
          nextAutoReminderAt: null,
          nextTeacherFollowUpAt: null,
          clientIpHash: meta.clientIpHash,
          userAgentHash: meta.userAgentHash,
        },
      });
      await tx.freeTierApprovalDelivery.updateMany({
        where: { approvalId: pending.id, state: 'QUEUED' },
        data: { state: 'CANCELLED', error: 'denied' },
      });
      await invalidateOpenAdminApprovalLinks(tx, app.id);
      await tx.freeTierApprovalDecision.create({
        data: {
          applicationId: app.id,
          decision: 'DENIED',
          decidedByEmail: pending.adminEmail,
          reason: trimmedReason ?? `School admin deny (${pending.adminName})`,
        },
      });
      await queueTeacherDenyEmailInTransaction(tx, {
        approvalId: pending.id,
        now,
        teacherEmail: app.email,
        teacherName: app.name,
        schoolName: app.schoolName,
        adminName: pending.adminName,
        chainCapReached: app.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP,
      });

      return {
        ok: true as const,
        notify: {
          approvalId: pending.id,
          applicationId: app.id,
          teacherEmail: app.email,
          teacherName: app.name,
          schoolName: app.schoolName,
          adminName: pending.adminName,
          chainCapReached: app.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP,
        },
      };
    });
  } catch {
    result = fail('unavailable');
  }

  if (result.ok) {
    const linkId = linkIdFromSignedToken(args.token);
    const approvalId =
      ('notify' in result && result.notify?.approvalId) ||
      (earlyAppId
        ? (
            await prisma.freeTierAdminApproval.findFirst({
              where: {
                applicationId: earlyAppId,
                status: 'DENIED',
                ...(linkId ? { signedLinkId: linkId } : {}),
              },
              orderBy: { decidedAt: 'desc' },
              select: { id: true },
            })
          )?.id
        : null);
    if (approvalId) await flushTeacherDenyEmail(approvalId);
  }
  return result;
}

export async function loadTeacherDeniedSurface(args: { applicationId: string }) {
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: args.applicationId },
    select: {
      id: true,
      status: true,
      schoolName: true,
      name: true,
      adminRedirectCount: true,
    },
  });
  if (!app || (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW')) {
    return null;
  }
  const pending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: app.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (pending) return null;
  const denied = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: app.id, status: 'DENIED' },
    orderBy: { decidedAt: 'desc' },
    select: {
      id: true,
      adminName: true,
      adminEmail: true,
      decidedAt: true,
    },
  });
  if (!denied) return null;
  return {
    app,
    denied,
    forwardsRemaining: Math.max(0, ADMIN_REDIRECT_CHAIN_CAP - app.adminRedirectCount),
    chainCapReached: app.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP,
    askAnotherHint: teacherAskAnotherHint(
      app.adminRedirectCount,
      ADMIN_REDIRECT_CHAIN_CAP
    ),
  };
}
