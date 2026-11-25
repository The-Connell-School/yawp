import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { lockApprovalApplication } from './approval-lock.server';
import {
  isApprovalV2Enabled,
  queueHeldAdminApprovalInTransaction,
} from './approval-v2.server';
import { sendFreeTierAdminApprovalEmail } from './email.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import {
  abandonMintedSignedLinks,
  FREE_TIER_LINK_TTL_MS,
  mintSignedLink,
} from './signed-link.server';
import { assertTransition } from './state';
import {
  recordTesterAudit,
  type TesterAuditActor,
} from './tester-audit.server';

type Tx = Prisma.TransactionClient;

export type HeldApprovalResult =
  | { handled: false }
  | {
      handled: true;
      status: 200 | 409 | 502;
      payload: Record<string, unknown>;
    };

const VERIFIED_REASON =
  'Operator verified the administrator; approval request sent to the administrator.';

/**
 * A MANUAL_REVIEW request whose administrator email was held never went to the
 * administrator. When an operator approves it, send that request now instead of
 * approving the teacher directly (Brian, 11/25): the administrator still decides.
 * The application moves to SENT, which stays approvable, so a second operator
 * approve is the direct override. Anything else (no held request) is not handled
 * here and keeps the direct-approve path.
 */
export async function sendHeldAdminApprovalOnOperatorApprove(args: {
  id: string;
  decidedByEmail: string;
  audit?: TesterAuditActor;
}): Promise<HeldApprovalResult> {
  const prepared = await prisma.$transaction(async (tx) => {
    await lockApprovalApplication(tx, args.id);
    const app = await tx.freeTierApplication.findUnique({
      where: { id: args.id },
    });
    if (!app || app.status !== 'MANUAL_REVIEW')
      return { handled: false as const };
    const approval = await findHeldApproval(tx, app.id);
    if (!approval) return { handled: false as const };
    assertTransition('MANUAL_REVIEW', 'SENT');

    const v2 = await isApprovalV2Enabled(app, tx);
    let v1: {
      approveToken: string;
      declineToken: string;
      linkIds: string[];
    } | null = null;
    if (v2) {
      await queueHeldAdminApprovalInTransaction(tx, app, approval);
    } else {
      const approve = await mintSignedLink({
        applicationId: app.id,
        purpose: 'ADMIN_APPROVE',
        ttlMs: FREE_TIER_LINK_TTL_MS,
        tx,
      });
      const decline = await mintSignedLink({
        applicationId: app.id,
        purpose: 'ADMIN_NOT_RIGHT_PERSON',
        ttlMs: FREE_TIER_LINK_TTL_MS,
        tx,
      });
      await tx.freeTierAdminApproval.update({
        where: { id: approval.id },
        data: { signedLinkId: approve.linkId },
      });
      v1 = {
        approveToken: approve.token,
        declineToken: decline.token,
        linkIds: [approve.linkId, decline.linkId],
      };
    }
    const moved = await tx.freeTierApplication.updateMany({
      where: { id: app.id, status: 'MANUAL_REVIEW' },
      data: { status: 'SENT' },
    });
    if (moved.count === 0) throw new Error('held approval conflict');
    await tx.freeTierApprovalDecision.create({
      data: {
        applicationId: app.id,
        decision: 'MANUAL_REVIEW',
        reason: VERIFIED_REASON,
        decidedByEmail: args.decidedByEmail,
      },
    });
    if (args.audit) {
      await recordTesterAudit(tx, args.audit, app.id, {
        previousStatus: 'MANUAL_REVIEW',
        status: 'SENT',
        adminApprovalSent: true,
      });
    }
    return {
      handled: true as const,
      v2,
      v1,
      approvalId: approval.id,
      app: {
        id: app.id,
        email: app.email,
        name: app.name,
        schoolName: app.schoolName,
        organizationId: app.organizationId,
      },
      adminEmail: approval.adminEmail,
      approval,
    };
  });
  if (!prepared.handled) return prepared;

  const payload = {
    ok: true,
    status: 'SENT',
    previousStatus: 'MANUAL_REVIEW',
    adminApprovalSent: true,
    adminEmail: prepared.adminEmail,
  };
  if (prepared.v2 || !prepared.v1)
    return {
      handled: true,
      status: 200,
      payload: { ...payload, queued: true },
    };

  // Legacy path: send directly, like submitAdminDetails does for an unheld request.
  const base = freeTierPublicAppOrigin();
  const pass1 = await isFeatureFlagEnabled(
    FREE_TIER_FLAG,
    prepared.app.organizationId
  );
  const sent = await sendFreeTierAdminApprovalEmail({
    applicationId: prepared.app.id,
    to: prepared.adminEmail,
    teacherEmail: prepared.app.email,
    teacherName: prepared.app.name,
    schoolName: prepared.app.schoolName,
    approveUrl: `${base}/free/admin/approve?t=${encodeURIComponent(prepared.v1.approveToken)}`,
    notRightPersonUrl: `${base}/free/admin/not-right-person?t=${encodeURIComponent(prepared.v1.declineToken)}`,
    pass1,
  });
  if (!sent.ok) {
    await abandonMintedSignedLinks(prepared.v1.linkIds);
    // Put it back in the queue so the operator can retry; nothing reached the administrator.
    await prisma.freeTierApplication.updateMany({
      where: { id: prepared.app.id, status: 'SENT' },
      data: { status: 'MANUAL_REVIEW' },
    });
    return {
      handled: true,
      status: 502,
      payload: {
        error:
          'Administrator email could not be sent. The request is still held for review.',
      },
    };
  }
  await prisma.freeTierAdminApproval.update({
    where: { id: prepared.approvalId },
    data: { firstSentAt: new Date() },
  });
  return { handled: true, status: 200, payload };
}

/** The newest PENDING administrator request that was held: never sent, queued, or escalated. */
export async function findHeldApproval(tx: Tx, applicationId: string) {
  const approval = await tx.freeTierAdminApproval.findFirst({
    where: { applicationId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  // Held at submit: never sent, never escalated, and nothing in the outbox.
  if (!approval || approval.firstSentAt || approval.needsManualFollowUp)
    return null;
  const delivered = await tx.freeTierApprovalDelivery.findFirst({
    where: { approvalId: approval.id },
    select: { id: true },
  });
  if (delivered) return null;
  const logged = await tx.freeTierEmailLog.findFirst({
    where: {
      applicationId,
      kind: 'admin_approval',
      toEmail: approval.adminEmail,
      success: true,
      createdAt: { gte: approval.createdAt },
    },
    select: { id: true },
  });
  return logged ? null : approval;
}
