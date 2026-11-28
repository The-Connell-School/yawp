import { GetSuppressedDestinationCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import { FREE_TIER_HELLO_EMAIL } from './admin-approval-copy';
import {
  ADMIN_EMAIL_BOUNCED_STOP,
  ADMIN_EMAIL_FAILED_STOP,
  isAdminEmailUndeliverableStop,
  suppressionMatchesSend,
  teacherAdminEmailUndeliverableBody,
  teacherAdminEmailUndeliverableSubject,
  teamAdminEmailUndeliverableBody,
  teamAdminEmailUndeliverableSubject,
} from './admin-approval-undeliverable-copy';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import { internalFreeTierReviewQueueUrl } from './internal-review-queue-url';

export const TEACHER_UNDELIVERABLE_NOTICE_KIND =
  'admin_approval_undeliverable_teacher';
export const TEAM_UNDELIVERABLE_NOTICE_KIND =
  'team_contact_admin_approval_undeliverable';

const ADMIN_EMAIL_KINDS = ['admin_approval', 'admin_approval_reminder'] as const;

type NoticeResult = {
  ok: true;
  skipped?: 'closed' | 'not_pending' | 'unknown_message';
  teacherNotified: boolean;
  teamNotified: boolean;
};

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as Record<string, unknown>;
}

async function alreadyNotified(
  applicationId: string,
  kind: string,
  approvalId: string
) {
  const rows = await prisma.freeTierEmailLog.findMany({
    where: { applicationId, kind, success: true },
    select: { payload: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return rows.some((row) => payloadRecord(row.payload)?.approvalId === approvalId);
}

async function sendNoticeOnce(args: {
  applicationId: string;
  approvalId: string;
  kind: string;
  to: string;
  subject: string;
  text: string;
}) {
  if (await alreadyNotified(args.applicationId, args.kind, args.approvalId)) {
    return true;
  }
  let success = false;
  let error: string | undefined;
  try {
    const result = await sendEmail({
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.text.replace(/\n/g, '<br>\n'),
      singleAttempt: true,
      logKind: args.kind,
    });
    success = result.status === 'success';
    if (!success) error = 'email_send_failed';
  } catch {
    error = 'email_send_failed';
  }
  try {
    await prisma.freeTierEmailLog.create({
      data: {
        applicationId: args.applicationId,
        kind: args.kind,
        toEmail: args.to,
        success,
        error: error ?? null,
        payload:
          sanitizeFreeTierEmailLogPayload({ approvalId: args.approvalId }) ??
          undefined,
      },
    });
  } catch {
    // A log failure must not hide the send result from the caller.
  }
  return success;
}

/**
 * Mark a still-open administrator request when its approval email bounced or
 * failed, tell the teacher how to pick another address, and tell the team.
 */
export async function recordAdminApprovalUndeliverable(args: {
  applicationId: string;
  approvalId?: string | null;
  adminEmail?: string | null;
  reason: 'bounced' | 'failed';
}): Promise<NoticeResult> {
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: args.applicationId },
    select: { id: true, email: true, name: true, schoolName: true, status: true },
  });
  if (!app || (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW')) {
    return { ok: true, skipped: 'closed', teacherNotified: false, teamNotified: false };
  }
  const approval = args.approvalId
    ? await prisma.freeTierAdminApproval.findFirst({
        where: {
          id: args.approvalId,
          applicationId: app.id,
          status: 'PENDING',
        },
      })
    : await prisma.freeTierAdminApproval.findFirst({
        where: {
          applicationId: app.id,
          status: 'PENDING',
          ...(args.adminEmail ? { adminEmail: args.adminEmail } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
  if (!approval) {
    return {
      ok: true,
      skipped: 'not_pending',
      teacherNotified: false,
      teamNotified: false,
    };
  }
  const stopReason =
    args.reason === 'bounced' ? ADMIN_EMAIL_BOUNCED_STOP : ADMIN_EMAIL_FAILED_STOP;
  if (!isAdminEmailUndeliverableStop(approval.stopReason)) {
    await prisma.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: {
        needsManualFollowUp: true,
        autoRemindersStopped: true,
        stopReason,
        nextAutoReminderAt: null,
      },
    });
  }
  await prisma.freeTierApprovalDelivery.updateMany({
    where: {
      approvalId: approval.id,
      kind: { in: ['admin_approval', 'admin_reminder'] },
      state: 'QUEUED',
    },
    data: { state: 'CANCELLED', error: stopReason },
  });
  const pendingUrl = `${freeTierPublicAppOrigin()}/app/free-tier/pending?ask=1`;
  const teacherNotified = await sendNoticeOnce({
    applicationId: app.id,
    approvalId: approval.id,
    kind: TEACHER_UNDELIVERABLE_NOTICE_KIND,
    to: app.email,
    subject: teacherAdminEmailUndeliverableSubject(),
    text: teacherAdminEmailUndeliverableBody({
      teacherName: app.name,
      adminName: approval.adminName,
      adminEmail: approval.adminEmail,
      schoolName: app.schoolName,
      pendingUrl,
    }),
  });
  const teamNotified = await sendNoticeOnce({
    applicationId: app.id,
    approvalId: approval.id,
    kind: TEAM_UNDELIVERABLE_NOTICE_KIND,
    to: FREE_TIER_HELLO_EMAIL,
    subject: teamAdminEmailUndeliverableSubject(app.schoolName),
    text: teamAdminEmailUndeliverableBody({
      teacherName: app.name,
      teacherEmail: app.email,
      schoolName: app.schoolName,
      adminName: approval.adminName,
      adminEmail: approval.adminEmail,
      applicationId: app.id,
      reason: args.reason,
      reviewUrl: internalFreeTierReviewQueueUrl(app.email),
    }),
  });
  return { ok: true, teacherNotified, teamNotified };
}

export async function recordUndeliverableByProviderMessage(args: {
  providerMessageId: string;
  reason: 'bounced' | 'failed';
}): Promise<NoticeResult> {
  const log = await prisma.freeTierEmailLog.findFirst({
    where: {
      kind: { in: [...ADMIN_EMAIL_KINDS] },
      payload: { path: ['providerMessageId'], equals: args.providerMessageId },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!log) {
    return {
      ok: true,
      skipped: 'unknown_message',
      teacherNotified: false,
      teamNotified: false,
    };
  }
  const payload = payloadRecord(log.payload);
  const approvalId =
    payload && typeof payload.approvalId === 'string' ? payload.approvalId : null;
  return recordAdminApprovalUndeliverable({
    applicationId: log.applicationId,
    approvalId,
    adminEmail: log.toEmail,
    reason: args.reason,
  });
}

type SuppressionLookup = (email: string) => Promise<{
  reason?: string;
  lastUpdateTime?: Date;
} | null>;

let lastSuppressionPoll = 0;

async function lookupSesSuppression(email: string) {
  try {
    const client = new SESv2Client({
      region: process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? 'us-east-1',
    });
    const response = await client.send(
      new GetSuppressedDestinationCommand({ EmailAddress: email })
    );
    return {
      reason: response.SuppressedDestination?.Reason,
      lastUpdateTime: response.SuppressedDestination?.LastUpdateTime,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotFoundException') return null;
    console.error({ event: 'ses_suppression_lookup_failed', name: name || 'error' });
    return null;
  }
}

/**
 * Production sends through SES. Account suppression is the bounce signal that
 * does not depend on a webhook being subscribed. Unknown addresses and
 * permission errors are ignored so a missing IAM grant cannot block delivery.
 */
export async function pollSuppressedAdminApprovals(args?: {
  now?: Date;
  lookup?: SuppressionLookup;
  minIntervalMs?: number;
}) {
  const provider = process.env.EMAIL_PROVIDER?.toLowerCase();
  if (provider !== 'ses' && provider !== 'aws-ses') return;
  const nowMs = Date.now();
  const minInterval = args?.minIntervalMs ?? 10 * 60 * 1000;
  if (!args?.lookup && nowMs - lastSuppressionPoll < minInterval) return;
  if (!args?.lookup) lastSuppressionPoll = nowMs;
  const lookup = args?.lookup ?? lookupSesSuppression;
  const since = new Date(nowMs - 14 * 24 * 60 * 60 * 1000);
  const approvals = await prisma.freeTierAdminApproval.findMany({
    where: {
      status: 'PENDING',
      firstSentAt: { not: null, gte: since },
      needsManualFollowUp: false,
      application: { status: { in: ['SENT', 'MANUAL_REVIEW'] } },
    },
    orderBy: { firstSentAt: 'desc' },
    take: 25,
    select: {
      id: true,
      applicationId: true,
      adminEmail: true,
      firstSentAt: true,
    },
  });
  const seen = new Set<string>();
  for (const approval of approvals) {
    const email = approval.adminEmail.trim().toLowerCase();
    if (!approval.firstSentAt || seen.has(email)) continue;
    seen.add(email);
    const suppressed = await lookup(approval.adminEmail);
    if (
      !suppressionMatchesSend({
        reason: suppressed?.reason,
        lastUpdateTime: suppressed?.lastUpdateTime,
        sentAt: approval.firstSentAt,
      })
    ) {
      continue;
    }
    await recordAdminApprovalUndeliverable({
      applicationId: approval.applicationId,
      approvalId: approval.id,
      adminEmail: approval.adminEmail,
      reason: 'bounced',
    });
  }
}
