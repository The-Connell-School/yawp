import { canSendApprovalReminder } from './approval-reminders';
import { lockApprovalApplication } from './approval-lock.server';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import type {
  Prisma,
  FreeTierApplication,
  FreeTierAdminApproval,
} from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { sendEmail } from '~/utils/email.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import {
  isFeatureFlagEnabled,
  resolvedFreeTierRollout,
} from '~/domain/feature-flags/feature-flags.server';
import {
  claimSignedLinkInTransaction,
  invalidateOpenAdminApprovalLinks,
  mintSignedLink,
  peekSignedLink,
} from './signed-link.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import {
  renderAdminApprovalEmailBody,
  adminApprovalEmailCopyVersionHash,
} from './email-copy.server';
import { plainTextEmailToHtml } from './email-html.server';
import {
  evaluateAdminEmailForRuntime,
  ADMIN_REDIRECT_CHAIN_CAP,
} from './admin-email-rules.server';
import { resolveFreeTierRuntimeEnvironment } from './usage-budget.server';
import { forwardApprovalSchema } from './approval-waiting';
import { selfAdminEmailError } from './admin-email';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOUR_MS = 3600000;
type Tx = Prisma.TransactionClient;
type AppIdentity = Pick<
  FreeTierApplication,
  'id' | 'userId' | 'organizationId'
>;
type Message = {
  to: string;
  subject: string;
  text: string;
  approveLinkId?: string;
  declineLinkId?: string;
};
const fail = (reason: string) => ({ ok: false as const, reason });

/** Fails closed; existing site memberships never enter this rollout. */
export async function isApprovalV2Enabled(app: AppIdentity, db: Tx = prisma) {
  try {
    if (
      !(await isFeatureFlagEnabled(FREE_TIER_FLAG, app.organizationId)) ||
      !app.userId
    )
      return false;
    const paid = await db.orgMembership.findFirst({
      where: {
        userId: app.userId,
        organization: {
          plan: { not: 'FREE_CLASSROOM' },
          id: { not: 'default-org' },
        },
      },
      select: { id: true },
    });
    return !paid;
  } catch {
    return false;
  }
}

function keys() {
  const raw =
    process.env.FREE_TIER_LINK_HMAC_SECRET ||
    (process.env.YAWP_ENVIRONMENT === 'preview'
      ? process.env.PREVIEW_ACCESS_SECRET
      : '');
  if (!raw) throw new Error('Approval link signing is not configured');
  return raw
    .split(',')
    .map((key) =>
      createHash('sha256').update(`approval-outbox:${key.trim()}`).digest()
    );
}
function encrypt(message: Message) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keys()[0]!, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(message), 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}
function decrypt(value: string): Message {
  const data = Buffer.from(value, 'base64');
  for (const key of keys()) {
    try {
      const cipher = createDecipheriv('aes-256-gcm', key, data.subarray(0, 12));
      cipher.setAuthTag(data.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          cipher.update(data.subarray(28)),
          cipher.final(),
        ]).toString('utf8')
      );
    } catch {
      /* try configured keys */
    }
  }
  throw new Error('Approval delivery payload unavailable');
}
async function adminMessage(
  tx: Tx,
  app: FreeTierApplication,
  approval: FreeTierAdminApproval,
  reminder: boolean
): Promise<Message> {
  const approve = await mintSignedLink({
    applicationId: app.id,
    purpose: 'ADMIN_APPROVE',
    tx,
  });
  const decline = await mintSignedLink({
    applicationId: app.id,
    purpose: 'ADMIN_NOT_RIGHT_PERSON',
    tx,
  });
  const base = freeTierPublicAppOrigin();
  return {
    to: approval.adminEmail,
    subject: `${reminder ? 'Reminder: ' : ''}Approve Yawp! for ${app.schoolName}`,
    text: renderAdminApprovalEmailBody({
      teacherName: app.name,
      teacherEmail: app.email,
      schoolName: app.schoolName,
      adminRecipientName: approval.adminName,
      approveUrl: `${base}/free/admin/approve?t=${encodeURIComponent(approve.token)}`,
      notRightPersonUrl: `${base}/free/admin/not-right-person?t=${encodeURIComponent(decline.token)}`,
      reminderLead: reminder
        ? 'This is a reminder about the approval request below.'
        : undefined,
    }),
    approveLinkId: approve.linkId,
    declineLinkId: decline.linkId,
  };
}
async function queue(
  tx: Tx,
  approvalId: string,
  kind: string,
  sequence: number,
  now: Date,
  message: Message,
  extra: { source?: string; actorEmail?: string; idempotencyKey?: string } = {}
) {
  return tx.freeTierApprovalDelivery.upsert({
    where: { approvalId_kind_sequence: { approvalId, kind, sequence } },
    create: {
      approvalId,
      kind,
      sequence,
      availableAt: now,
      payload: encrypt(message),
      ...extra,
    },
    update: {},
  });
}

/** Recover successful legacy sends on every check, including after rollout pauses.
 * A delivery and its email log represent one acceptance, never two reminders. */
async function enroll(
  tx: Tx,
  app: FreeTierApplication,
  approval: FreeTierAdminApproval
) {
  const log = approval.firstSentAt
    ? null
    : await tx.freeTierEmailLog.findFirst({
        where: {
          applicationId: app.id,
          kind: 'admin_approval',
          toEmail: approval.adminEmail,
          success: true,
          createdAt: { gte: approval.createdAt },
        },
        orderBy: { createdAt: 'asc' },
      });
  const firstSentAt = approval.firstSentAt ?? log?.createdAt;
  if (!firstSentAt) return approval;
  const reminders = await tx.freeTierEmailLog.findMany({
    where: {
      applicationId: app.id,
      kind: 'admin_approval_reminder',
      toEmail: approval.adminEmail,
      success: true,
      createdAt: { gte: approval.createdAt },
    },
    orderBy: { createdAt: 'desc' },
  });
  const deliveries = await tx.freeTierApprovalDelivery.findMany({
    where: { approvalId: approval.id, kind: 'admin_reminder', state: 'SENT' },
    select: { id: true, sentAt: true, source: true },
  });
  const accepted = new Map(
    deliveries
      .filter((d) => d.sentAt)
      .map((d) => [d.id, { at: d.sentAt!, source: d.source ?? 'manual' }])
  );
  for (const reminder of reminders) {
    const payload = reminder.payload;
    const deliveryId =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      typeof payload.deliveryId === 'string'
        ? payload.deliveryId
        : null;
    const source =
      payload &&
      typeof payload === 'object' &&
      !Array.isArray(payload) &&
      payload.source === 'auto'
        ? 'auto'
        : 'manual';
    const key = deliveryId ?? `log:${reminder.id}`;
    if (!accepted.has(key))
      accepted.set(key, { at: reminder.createdAt, source });
  }
  const last = [...accepted.values()].sort((a, b) => +b.at - +a.at)[0];
  const count = Math.max(approval.reminderCount, accepted.size);
  const stopped = !canSendApprovalReminder(count);
  const recoveredLast =
    last && (!approval.lastReminderAt || +last.at > +approval.lastReminderAt);
  const enrolling = !approval.firstSentAt;
  if (
    !enrolling &&
    count === approval.reminderCount &&
    !recoveredLast &&
    !(stopped && !approval.autoRemindersStopped)
  )
    return approval;
  return tx.freeTierAdminApproval.update({
    where: { id: approval.id },
    data: {
      firstSentAt,
      reminderCount: count,
      ...(recoveredLast
        ? { lastReminderAt: last.at, lastReminderSource: last.source }
        : {}),
      ...(enrolling
        ? {
            nextAutoReminderAt: new Date(+firstSentAt + WEEK_MS),
            nextTeacherFollowUpAt: new Date(+firstSentAt + WEEK_MS),
          }
        : {}),
      ...(stopped
        ? {
            autoRemindersStopped: true,
            stopReason:
              approval.stopReason === 'manual' ? 'manual' : 'max_reached',
            needsManualFollowUp: true,
            nextAutoReminderAt: null,
          }
        : {}),
    },
  });
}
export async function getApprovalWaitingDetails(app: AppIdentity) {
  if (!(await isApprovalV2Enabled(app))) return null;
  const approval = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: app.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      adminName: true,
      adminEmail: true,
      autoRemindersStopped: true,
      createdAt: true,
      firstSentAt: true,
    },
  });
  if (!approval)
    return { enabled: true as const, approval: null, firstSentAt: null };
  const log = approval.firstSentAt
    ? null
    : await prisma.freeTierEmailLog.findFirst({
        where: {
          applicationId: app.id,
          kind: 'admin_approval',
          toEmail: approval.adminEmail,
          success: true,
          createdAt: { gte: approval.createdAt },
        },
        orderBy: { createdAt: 'asc' },
      });
  return {
    enabled: true as const,
    approval,
    firstSentAt: approval.firstSentAt ?? log?.createdAt ?? null,
  };
}

export async function forwardApprovalRequest(args: {
  applicationId: string;
  currentApprovalId: string;
  userId?: string;
  token?: string;
  newAdminName: string;
  newAdminEmail: string;
  request: Request;
  tokenPurpose?: 'ADMIN_APPROVE' | 'ADMIN_NOT_RIGHT_PERSON';
}) {
  const parsed = forwardApprovalSchema.safeParse(args);
  if (!parsed.success)
    return {
      ...fail('validation'),
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  return prisma.$transaction(async (tx) => {
    await lockApprovalApplication(tx, args.applicationId);
    const app = await tx.freeTierApplication.findUnique({
      where: { id: args.applicationId },
    });
    if (!app || !(await isApprovalV2Enabled(app, tx)))
      return fail('not_allowed');
    if (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW')
      return fail('already_decided');
    const pending = await tx.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!pending || pending.id !== args.currentApprovalId)
      return fail('superseded');
    if (args.userId ? app.userId !== args.userId : !args.token)
      return fail('not_allowed');
    if (app.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP)
      return fail('chain_cap');
    const { newAdminEmail, newAdminName } = parsed.data;
    // Reject the teacher mailbox before demo's review bypass or any token claim.
    if (selfAdminEmailError(app.email, newAdminEmail))
      return fail('same_as_teacher');
    if (newAdminEmail === pending.adminEmail) return fail('same_administrator');
    const rules = evaluateAdminEmailForRuntime(
      {
        teacherEmail: app.email,
        adminEmail: newAdminEmail,
        schoolName: app.schoolName,
      },
      resolveFreeTierRuntimeEnvironment()
    );
    if (!args.userId && args.token) {
      const claimed = await claimSignedLinkInTransaction(tx, {
        token: args.token,
        expectedPurpose: args.tokenPurpose ?? 'ADMIN_NOT_RIGHT_PERSON',
      });
      if (!claimed.ok || claimed.applicationId !== app.id)
        return fail('invalid');
      if (
        args.tokenPurpose === 'ADMIN_APPROVE' &&
        pending.signedLinkId !== claimed.linkId
      )
        throw new Error('Superseded approval link');
    }
    const now = new Date();
    await tx.freeTierAdminApproval.update({
      where: { id: pending.id },
      data: {
        status: 'REDIRECTED',
        decidedAt: now,
        autoRemindersStopped: true,
        stopReason: 'forwarded',
        nextAutoReminderAt: null,
        nextTeacherFollowUpAt: null,
      },
    });
    await tx.freeTierApprovalDelivery.updateMany({
      where: { approvalId: pending.id, state: 'QUEUED' },
      data: { state: 'CANCELLED', error: 'forwarded' },
    });
    await invalidateOpenAdminApprovalLinks(tx, app.id);
    const next = await tx.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: newAdminName,
        adminEmail: newAdminEmail,
        redirectedFromId: pending.id,
        forwardedByRole: args.userId ? 'teacher' : 'admin',
        emailCopyVersionHash: adminApprovalEmailCopyVersionHash(),
      },
    });
    if (!rules.manualReview) {
      const message = await adminMessage(tx, app, next, false);
      await tx.freeTierAdminApproval.update({
        where: { id: next.id },
        data: { signedLinkId: message.approveLinkId },
      });
      await queue(tx, next.id, 'admin_approval', 0, now, message);
    }
    await queue(tx, next.id, 'forward_notice', 0, now, {
      to: app.email,
      subject: 'Your Yawp! approval request was forwarded',
      text: `Hi ${app.name},\n\nYour approval request is now with ${newAdminName} (${newAdminEmail}). ${rules.manualReview ? 'Our team is reviewing the new request.' : 'We will let you know when they approve.'}\n\nView your request: ${freeTierPublicAppOrigin()}/app/free-tier/pending`,
    });
    await tx.freeTierApplication.update({
      where: { id: app.id },
      data: {
        status: rules.manualReview ? 'MANUAL_REVIEW' : 'SENT',
        adminRedirectCount: { increment: 1 },
      },
    });
    return {
      ok: true as const,
      queued: true as const,
      adminName: newAdminName,
    };
  });
}

/** Token authorization is rechecked inside the locked mutation. */
export async function forwardApprovalByToken(args: {
  token: string;
  purpose?: 'ADMIN_APPROVE' | 'ADMIN_NOT_RIGHT_PERSON';
  newAdminName: string;
  newAdminEmail: string;
  request: Request;
}) {
  const peek = await peekSignedLink({
    token: args.token,
    expectedPurpose: args.purpose ?? 'ADMIN_NOT_RIGHT_PERSON',
  });
  if (!peek.ok) return peek;
  const pending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: peek.applicationId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!pending) return fail('not_allowed');
  return forwardApprovalRequest({
    ...args,
    tokenPurpose: args.purpose,
    applicationId: peek.applicationId,
    currentApprovalId: pending.id,
  });
}

export async function queueManualApprovalReminder(args: {
  applicationId: string;
  idempotencyKey: string;
  actorEmail?: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  if (!args.idempotencyKey || args.idempotencyKey.length > 200)
    return fail('invalid');
  return prisma.$transaction(async (tx) => {
    await lockApprovalApplication(tx, args.applicationId);
    const app = await tx.freeTierApplication.findUnique({
      where: { id: args.applicationId },
    });
    if (!app || !(await isApprovalV2Enabled(app, tx))) return fail('flag_off');
    if (app.status !== 'SENT') return fail('not_allowed');
    let approval = await tx.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!approval) return fail('already_decided');
    approval = await enroll(tx, app, approval);
    const replay = await tx.freeTierApprovalDelivery.findUnique({
      where: { idempotencyKey: args.idempotencyKey },
    });
    if (replay)
      return replay.approvalId === approval.id
        ? {
            ok: true as const,
            queued: replay.state !== 'SENT',
            deliveryId: replay.id,
            reminderCount:
              replay.state === 'SENT'
                ? replay.acceptedReminderCount!
                : approval.reminderCount,
            nextAutoReminderAt:
              replay.state === 'SENT'
                ? replay.acceptedNextAutoReminderAt
                : approval.nextAutoReminderAt,
          }
        : fail('invalid');
    if (
      !approval.firstSentAt ||
      approval.needsManualFollowUp ||
      !canSendApprovalReminder(approval.reminderCount)
    )
      return fail('not_allowed');
    const previous = await tx.freeTierApprovalDelivery.findFirst({
      where: { approvalId: approval.id, kind: 'admin_reminder' },
      orderBy: { createdAt: 'desc' },
    });
    if (
      (approval.lastReminderAt && +now - +approval.lastReminderAt < 600000) ||
      (previous &&
        (previous.state === 'QUEUED' ||
          previous.state === 'DELIVERING' ||
          +now - +(previous.sentAt ?? previous.createdAt) < 600000))
    )
      return fail('rate_limited');
    const message = await adminMessage(tx, app, approval, true);
    const job = await queue(
      tx,
      approval.id,
      'admin_reminder',
      approval.reminderCount + 1,
      now,
      message,
      {
        source: 'manual',
        actorEmail: args.actorEmail,
        idempotencyKey: args.idempotencyKey,
      }
    );
    return {
      ok: true as const,
      queued: true as const,
      deliveryId: job.id,
      reminderCount: approval.reminderCount,
      nextAutoReminderAt: approval.nextAutoReminderAt,
    };
  });
}

/** Compatibility adapter for existing callers and the I1 staff resend endpoint.
 * Success means accepted by the provider, never merely queued. */
export async function resendApprovalReminder(args: {
  applicationId: string;
  idempotencyKey: string;
  actorEmail?: string;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const queued = await queueManualApprovalReminder({ ...args, now });
  if (!queued.ok) return queued;
  await deliverJob(queued.deliveryId, now);
  const delivery = await prisma.freeTierApprovalDelivery.findUniqueOrThrow({
    where: { id: queued.deliveryId },
    include: { approval: true },
  });
  if (delivery.state !== 'SENT' || !delivery.sentAt)
    return fail(
      delivery.state === 'CANCELLED' ? 'not_allowed' : 'email_failed'
    );
  return {
    ok: true as const,
    sentAt: delivery.sentAt,
    reminderCount: delivery.acceptedReminderCount!,
    toEmail: delivery.approval.adminEmail,
    nextAutoReminderAt: delivery.acceptedNextAutoReminderAt,
  };
}

async function scheduleApplication(applicationId: string, now: Date) {
  await prisma.$transaction(async (tx) => {
    await lockApprovalApplication(tx, applicationId);
    const app = await tx.freeTierApplication.findUnique({
      where: { id: applicationId },
    });
    if (!app || !(await isApprovalV2Enabled(app, tx))) return;
    let approval = await tx.freeTierAdminApproval.findFirst({
      where: { applicationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (!approval) return;
    if (app.status !== 'SENT') {
      if (['APPROVED', 'REJECTED', 'EXPIRED'].includes(app.status)) {
        await tx.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: {
            autoRemindersStopped: true,
            stopReason: app.status === 'APPROVED' ? 'approved' : 'manual',
            nextAutoReminderAt: null,
            nextTeacherFollowUpAt: null,
          },
        });
        await tx.freeTierApprovalDelivery.updateMany({
          where: { approvalId: approval.id, state: 'QUEUED' },
          data: { state: 'CANCELLED', error: 'not_pending' },
        });
      }
      return;
    }
    approval = await enroll(tx, app, approval);
    if (!approval.firstSentAt) return;
    if (
      !approval.autoRemindersStopped &&
      canSendApprovalReminder(approval.reminderCount) &&
      approval.nextAutoReminderAt &&
      +approval.nextAutoReminderAt <= +now &&
      (!approval.lastReminderAt || +now - +approval.lastReminderAt >= 600000)
    ) {
      const existing = await tx.freeTierApprovalDelivery.findUnique({
        where: {
          approvalId_kind_sequence: {
            approvalId: approval.id,
            kind: 'admin_reminder',
            sequence: approval.reminderCount + 1,
          },
        },
      });
      if (!existing)
        await queue(
          tx,
          approval.id,
          'admin_reminder',
          approval.reminderCount + 1,
          now,
          await adminMessage(tx, app, approval, true),
          { source: 'auto' }
        );
    }
    if (
      approval.nextTeacherFollowUpAt &&
      +approval.nextTeacherFollowUpAt <= +now
    ) {
      await queue(
        tx,
        approval.id,
        'teacher_followup',
        approval.teacherFollowUpCount + 1,
        now,
        {
          to: app.email,
          subject: 'Your Yawp! classroom approval request',
          text: `Hi ${app.name},\n\nYour request is waiting for ${approval.adminName}. You can email your administrator directly or forward the request to the right person.\n\nView your request: ${freeTierPublicAppOrigin()}/app/free-tier/pending`,
        }
      );
    }
  });
}

async function allowedToDeliver(
  tx: Tx,
  job: { kind: string },
  approval: FreeTierAdminApproval,
  app: FreeTierApplication,
  now: Date
) {
  // Callers check rollout eligibility before entering this status check.
  if (approval.status !== 'PENDING') return false;
  const current = await tx.freeTierAdminApproval.findFirst({
    where: { applicationId: app.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (current?.id !== approval.id) return false;
  if (job.kind === 'forward_notice')
    return app.status === 'SENT' || app.status === 'MANUAL_REVIEW';
  return (
    app.status === 'SENT' &&
    (job.kind !== 'admin_reminder' ||
      (!approval.autoRemindersStopped &&
        canSendApprovalReminder(approval.reminderCount) &&
        (!approval.lastReminderAt ||
          +now - +approval.lastReminderAt >= 600000)))
  );
}
async function deliverJob(id: string, now: Date) {
  const claimed = await prisma.$transaction(async (tx) => {
    const initial = await tx.freeTierApprovalDelivery.findUnique({
      where: { id },
      include: { approval: true },
    });
    if (!initial) return false;
    await lockApprovalApplication(tx, initial.approval.applicationId);
    const job = await tx.freeTierApprovalDelivery.findUniqueOrThrow({
      where: { id },
      include: { approval: { include: { application: true } } },
    });
    if (job.state !== 'QUEUED' || +job.availableAt > +now) return false;
    if (!(await isApprovalV2Enabled(job.approval.application, tx)))
      return false;
    const approval = await enroll(tx, job.approval.application, job.approval);
    if (
      !(await allowedToDeliver(
        tx,
        job,
        approval,
        job.approval.application,
        now
      ))
    ) {
      // The job query already excludes paused rollout targets. Terminal and
      // replaced approvals cannot remain at the front of the delivery queue.
      if (
        job.approval.status !== 'PENDING' ||
        !['SENT', 'MANUAL_REVIEW'].includes(job.approval.application.status)
      )
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: { state: 'CANCELLED', error: 'not_eligible' },
        });
      return false;
    }
    // Paused/rejected jobs can outlive signed-link TTL. Refresh only a queued
    // never-accepted message, while holding the same application lock.
    let message: Message;
    try {
      message = decrypt(job.payload);
    } catch {
      await tx.freeTierApprovalDelivery.update({
        where: { id },
        data: { state: 'UNCERTAIN', error: 'payload_unavailable' },
      });
      await tx.freeTierAdminApproval.update({
        where: { id: job.approvalId },
        data: {
          needsManualFollowUp: true,
          autoRemindersStopped: true,
          stopReason: 'manual',
          nextAutoReminderAt: null,
        },
      });
      return false;
    }
    if (message.approveLinkId) {
      const link = await tx.freeTierSignedLink.findUnique({
        where: { id: message.approveLinkId },
        select: { expiresAt: true, usedAt: true },
      });
      if (!link || link.usedAt || +link.expiresAt <= Date.now() + HOUR_MS) {
        const refreshed = await adminMessage(
          tx,
          job.approval.application,
          job.approval,
          job.kind === 'admin_reminder'
        );
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: { payload: encrypt(refreshed) },
        });
        if (job.kind === 'admin_approval')
          await tx.freeTierAdminApproval.update({
            where: { id: job.approvalId },
            data: { signedLinkId: refreshed.approveLinkId },
          });
      }
    }
    await tx.freeTierApprovalDelivery.update({
      where: { id },
      data: {
        state: 'DELIVERING',
        attemptedAt: now,
        attempts: { increment: 1 },
      },
    });
    return true;
  });
  if (!claimed) return;
  // The claim is durable before sending. A process crash cannot trigger replay.
  await prisma.$transaction(
    async (tx) => {
      const initial = await tx.freeTierApprovalDelivery.findUniqueOrThrow({
        where: { id },
        include: { approval: true },
      });
      await lockApprovalApplication(tx, initial.approval.applicationId);
      const job = await tx.freeTierApprovalDelivery.findUniqueOrThrow({
        where: { id },
        include: { approval: { include: { application: true } } },
      });
      const app = job.approval.application;
      if (job.state !== 'DELIVERING') return;
      const rolloutEnabled = await isApprovalV2Enabled(app, tx);
      const approval = rolloutEnabled
        ? await enroll(tx, app, job.approval)
        : job.approval;
      if (!rolloutEnabled || !(await isApprovalV2Enabled(app, tx))) {
        // This worker has not contacted the provider. A rollout/targeting pause
        // must retain the unique slot and must not consume a provider attempt.
        // Requeue only here; abandoned or ambiguous claims remain UNCERTAIN.
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: {
            state: 'QUEUED',
            attemptedAt: null,
            attempts: { decrement: 1 },
            error: 'rollout_paused',
          },
        });
        return;
      }
      if (!(await allowedToDeliver(tx, job, approval, app, now))) {
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: { state: 'CANCELLED', error: 'not_eligible' },
        });
        return;
      }
      let message: Message;
      try {
        message = decrypt(job.payload);
      } catch {
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: { state: 'UNCERTAIN', error: 'payload_unavailable' },
        });
        await tx.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: {
            needsManualFollowUp: true,
            autoRemindersStopped: true,
            stopReason: 'manual',
            nextAutoReminderAt: null,
          },
        });
        return;
      }
      let accepted = false,
        retryable = false;
      try {
        const result = await sendEmail({
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: plainTextEmailToHtml(message.text),
          singleAttempt: true,
        });
        accepted = result.status === 'success';
        if (result.status === 'error') {
          const code = result.error.statusCode;
          retryable = code >= 400 && code < 500 && code !== 408;
        }
      } catch {
        /* network/provider ambiguity must never be retried automatically */
      }
      if (!accepted) {
        const retry = retryable && job.attempts < 5;
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: {
            state: retry ? 'QUEUED' : 'UNCERTAIN',
            availableAt: new Date(+now + HOUR_MS),
            error: retry ? 'provider_rejected' : 'delivery_uncertain',
          },
        });
        await tx.freeTierEmailLog.create({
          data: {
            applicationId: app.id,
            kind:
              job.kind === 'admin_reminder'
                ? 'admin_approval_reminder'
                : job.kind,
            toEmail: message.to,
            success: false,
            error: retry ? 'provider_rejected' : 'delivery_uncertain',
            payload: {
              deliveryId: id,
              approvalId: approval.id,
              source: job.source,
            },
          },
        });
        if (!retry)
          await tx.freeTierAdminApproval.update({
            where: { id: approval.id },
            data: {
              needsManualFollowUp: true,
              autoRemindersStopped: true,
              stopReason: 'manual',
              nextAutoReminderAt: null,
            },
          });
        return;
      }
      await tx.freeTierApprovalDelivery.update({
        where: { id },
        data: { state: 'SENT', sentAt: now, error: null },
      });
      await tx.freeTierEmailLog.create({
        data: {
          applicationId: app.id,
          createdAt: now,
          kind:
            job.kind === 'admin_reminder'
              ? 'admin_approval_reminder'
              : job.kind,
          toEmail: message.to,
          success: true,
          payload: {
            deliveryId: id,
            approvalId: approval.id,
            source: job.source,
          },
        },
      });
      if (message.approveLinkId) {
        await invalidateOpenAdminApprovalLinks(tx, app.id, {
          exceptLinkIds: [message.approveLinkId, message.declineLinkId!],
        });
        await tx.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: { signedLinkId: message.approveLinkId },
        });
      }
      if (job.kind === 'admin_approval')
        await tx.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: {
            firstSentAt: now,
            nextAutoReminderAt: new Date(+now + WEEK_MS),
            nextTeacherFollowUpAt: new Date(+now + WEEK_MS),
          },
        });
      if (job.kind === 'admin_reminder') {
        const count = approval.reminderCount + 1;
        // No catch-up bursts after outages. Manual sends retain the current slot.
        const anchor = +(approval.firstSentAt ?? now);
        const next =
          job.source === 'manual'
            ? approval.nextAutoReminderAt
            : new Date(
                anchor + (Math.floor((+now - anchor) / WEEK_MS) + 1) * WEEK_MS
              );
        await tx.freeTierApprovalDelivery.update({
          where: { id },
          data: {
            acceptedReminderCount: count,
            acceptedNextAutoReminderAt: !canSendApprovalReminder(count)
              ? null
              : next,
          },
        });
        await tx.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: {
            reminderCount: count,
            lastReminderAt: now,
            lastReminderSource: job.source,
            nextAutoReminderAt: !canSendApprovalReminder(count) ? null : next,
            autoRemindersStopped: !canSendApprovalReminder(count),
            needsManualFollowUp: !canSendApprovalReminder(count),
            stopReason: !canSendApprovalReminder(count) ? 'max_reached' : null,
          },
        });
      }
      if (job.kind === 'teacher_followup')
        await tx.freeTierAdminApproval.update({
          where: { id: approval.id },
          data: {
            teacherFollowUpCount: { increment: 1 },
            lastTeacherFollowUpAt: now,
            nextTeacherFollowUpAt: new Date(+now + WEEK_MS),
          },
        });
    },
    { timeout: 30000 }
  );
}

/** Bounded durable work; multiple app instances may safely run this drain. */
export async function runApprovalJobs(now = new Date()) {
  // No writes, scheduling, or delivery when the rollout is globally off.
  const rollout = await resolvedFreeTierRollout(prisma);
  if (rollout.mode === 'off') return;
  const scope =
    rollout.mode === 'targeted'
      ? { organizationId: { in: rollout.orgIds } }
      : {};
  // Keyset pagination visits every request and queued job without loading the
  // whole population or starving later rows behind paused entries.
  let applicationCursor: string | undefined;
  while (true) {
    const applications = await prisma.freeTierApplication.findMany({
      where: {
        ...scope,
        OR: [
          { status: { in: ['SENT', 'MANUAL_REVIEW'] } },
          {
            status: { in: ['APPROVED', 'REJECTED', 'EXPIRED'] },
            adminApprovals: {
              some: {
                status: 'PENDING',
                OR: [
                  { nextAutoReminderAt: { not: null } },
                  { nextTeacherFollowUpAt: { not: null } },
                ],
              },
            },
          },
        ],
      },
      orderBy: { id: 'asc' },
      take: 100,
      ...(applicationCursor
        ? { cursor: { id: applicationCursor }, skip: 1 }
        : {}),
      select: { id: true },
    });
    for (const app of applications) await scheduleApplication(app.id, now);
    if (applications.length < 100) break;
    applicationCursor = applications.at(-1)!.id;
  }
  let jobCursor: string | undefined;
  while (true) {
    const jobs = await prisma.freeTierApprovalDelivery.findMany({
      where: {
        state: 'QUEUED',
        availableAt: { lte: now },
        approval: { application: scope },
      },
      orderBy: { id: 'asc' },
      take: 100,
      ...(jobCursor ? { cursor: { id: jobCursor }, skip: 1 } : {}),
      select: { id: true },
    });
    for (const job of jobs) await deliverJob(job.id, now);
    if (jobs.length < 100) break;
    jobCursor = jobs.at(-1)!.id;
  }
  const abandoned = await prisma.freeTierApprovalDelivery.findMany({
    where: {
      state: 'DELIVERING',
      approval: { application: scope },
      attemptedAt: { lt: new Date(+now - 600000) },
    },
    take: 100,
    include: { approval: true },
  });
  for (const job of abandoned)
    await prisma.$transaction(async (tx) => {
      await lockApprovalApplication(tx, job.approval.applicationId);
      const changed = await tx.freeTierApprovalDelivery.updateMany({
        where: { id: job.id, state: 'DELIVERING' },
        data: { state: 'UNCERTAIN', error: 'interrupted_delivery' },
      });
      if (changed.count)
        await tx.freeTierAdminApproval.update({
          where: { id: job.approvalId },
          data: {
            needsManualFollowUp: true,
            autoRemindersStopped: true,
            stopReason: 'manual',
            nextAutoReminderAt: null,
          },
        });
    });
}
