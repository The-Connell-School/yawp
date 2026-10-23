import { isClassPreparationEnabled } from './class-preparation.server';
import { needsClassPreparation } from './class-preparation';
import { lockApprovalApplication } from './approval-lock.server';
import { isApprovalV2Enabled, resendApprovalReminder, forwardApprovalByToken } from './approval-v2.server';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { assertTransition } from './state';
import { normalizeEmail } from './service.server';
import { selfAdminEmailError } from './admin-email';
import {
  ADMIN_REDIRECT_CHAIN_CAP,
  evaluateAdminEmailForRuntime,
} from './admin-email-rules.server';
import { adminApprovalEmailCopyVersionHash } from './email-copy.server';
import {
  mintSignedLink,
  claimSignedLinkInTransaction,
  applicationIdFromSignedToken,
  FREE_TIER_LINK_TTL_MS,
  peekSignedLink,
  invalidateOpenAdminApprovalLinks,
  abandonMintedSignedLinks,
} from './signed-link.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import { ensureFreeTierProductionApprovalHooks } from './approval-hooks.server';
import { forwardApprovalSchema } from './approval-waiting';
import {
  fetchFreeTierApplicationTerminalGate,
  forwardIdempotentReplay,
  resolveAdminLinkReplacedGate,
  resolveAdminLinkTerminalGate,
} from './admin-link-gate.server';
import {
  sendFreeTierAdminApprovalEmail,
  sendFreeTierAdminReminderEmail,
  sendFreeTierCongratulationsEmail,
  sendFreeTierReleaseEmail,
} from './email.server';
import { resolveAdminApprovalEmailContext } from './admin-approval-email-context.server';
import { FREE_TIER_FLAG } from '~/domain/feature-flags/feature-flags';
import { isFeatureFlagEnabled } from '~/domain/feature-flags/feature-flags.server';
import { getApprovalHooks } from './approval-hooks.server';
import { getClientIp } from '~/utils/ip.server';
import {
  assertFreeTierBudgetHeadroomForTransition,
  FreeTierBudgetExceededError,
  resolveFreeTierRuntimeEnvironment,
  type FreeTierUsageSummary,
} from './usage-budget.server';

export type FreeTierTransactionalFailure = {
  ok: false;
  reason: string;
  status?: string;
  budget?: FreeTierUsageSummary;
  operatorMessage?: string;
};

export class FreeTierTransactionalAbortError extends Error {
  readonly result: FreeTierTransactionalFailure;

  constructor(result: FreeTierTransactionalFailure) {
    super(result.reason);
    this.name = 'FreeTierTransactionalAbortError';
    this.result = result;
  }
}

function abortClaimedLinkTransaction(result: FreeTierTransactionalFailure): never {
  throw new FreeTierTransactionalAbortError(result);
}

function budgetExceededFailure(error: FreeTierBudgetExceededError): FreeTierTransactionalFailure {
  return {
    ok: false,
    reason: 'budget_exceeded',
    budget: error.summary,
    operatorMessage: `Free-tier ${error.summary.environment} budget reached: $${error.summary.spendUsd.toFixed(2)} of $${error.summary.budgetUsd.toFixed(2)} used.`,
  };
}

function mapTransactionalAbort(error: unknown) {
  if (error instanceof FreeTierTransactionalAbortError) return error.result;
  throw error;
}

function hashClientMeta(value: string) {
  const secret = process.env.FREE_TIER_LINK_HMAC_SECRET?.trim() || 'dev';
  return createHash('sha256').update(`${secret}:${value}`).digest('hex');
}

export function hashRequestMeta(request: Request) {
  const ip = getClientIp(request) ?? 'unknown';
  const ua = request.headers.get('user-agent') ?? '';
  return {
    clientIpHash: hashClientMeta(ip),
    userAgentHash: hashClientMeta(ua.slice(0, 500)),
  };
}

export async function sendReleaseEmailsForApplicationIds(applicationIds: string[]) {
  const results: { applicationId: string; ok: boolean; error?: string }[] = [];
  for (const id of applicationIds) {
    const app = await prisma.freeTierApplication.findUnique({
      where: { id, status: 'INVITED' },
      select: { id: true, email: true, name: true, schoolName: true },
    });
    if (!app) {
      results.push({ applicationId: id, ok: false, error: 'not_invited' });
      continue;
    }
    const sent = await sendFreeTierReleaseEmail({
      applicationId: app.id,
      email: app.email,
      name: app.name,
      schoolName: app.schoolName,
    });
    results.push({
      applicationId: app.id,
      ok: sent.ok,
      error: sent.ok ? undefined : sent.error,
    });
  }
  return results;
}

export async function submitAdminDetails(args: {
  applicationId: string;
  userId: string;
  adminName: string;
  adminEmail: string;
  adminRole: string;
  personalNote?: string;
}) {
  const adminEmail = normalizeEmail(args.adminEmail);
  const app = await prisma.freeTierApplication.findFirst({
    where: { id: args.applicationId, userId: args.userId },
    select: { id: true, status: true, email: true, name: true, schoolName: true, organizationId: true, starterClassName: true, starterClassGrade: true },
  });
  if (!app) return { ok: false as const, reason: 'not_found' as const };
  if (app.status !== 'ACCOUNT_CREATED' && app.status !== 'ADMIN_SUBMITTED') {
    return { ok: false as const, reason: 'illegal_state' as const, status: app.status };
  }

  // Use the authorized persisted application, before demo's manual-review bypass
  // and before minting links, writing approval state, or dispatching mail.
  const adminEmailError = selfAdminEmailError(app.email, adminEmail);
  if (adminEmailError) {
    return {
      ok: false as const,
      reason: 'same_as_teacher' as const,
      fieldErrors: { adminEmail: adminEmailError },
    };
  }

  const classStepEnabled = await isClassPreparationEnabled(args.userId, app.organizationId);
  if (needsClassPreparation(app, classStepEnabled)) {
    return { ok: false as const, reason: 'class_required' as const };
  }

  const rules = evaluateAdminEmailForRuntime(
    { teacherEmail: app.email, adminEmail, schoolName: app.schoolName },
    resolveFreeTierRuntimeEnvironment()
  );

  const copyHash = await adminApprovalEmailCopyVersionHash();
  // Kept in the API for older callers; introductions are no longer accepted.
  const note = null;

  const result = await prisma.$transaction(async (tx) => {
    if (classStepEnabled) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_provision:' || ${app.id}))`;
    }
    const current = await tx.freeTierApplication.findUnique({
      where: { id: app.id },
      select: { status: true },
    });
    if (!current) return { ok: false as const, reason: 'not_found' as const };
    if (current.status === 'ADMIN_SUBMITTED') {
      // allow resubmit while still in admin_submitted before send
    } else if (current.status === 'ACCOUNT_CREATED') {
      assertTransition('ACCOUNT_CREATED', 'ADMIN_SUBMITTED');
      const updated = await tx.freeTierApplication.updateMany({
        where: { id: app.id, status: 'ACCOUNT_CREATED' },
        data: { status: 'ADMIN_SUBMITTED', teacherPersonalNote: note },
      });
      if (updated.count === 0) return { ok: false as const, reason: 'conflict' as const };
    } else {
      return { ok: false as const, reason: 'illegal_state' as const, status: current.status };
    }

    await tx.freeTierApplication.update({
      where: { id: app.id },
      data: { teacherPersonalNote: note },
    });

    const approveMint = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });
    const declineMint = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });

    const approval = await tx.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: args.adminName.trim(),
        adminEmail,
        adminRole: args.adminRole.trim(),
        status: 'PENDING',
        signedLinkId: approveMint.linkId,
        emailCopyVersionHash: copyHash,
        personalNote: note,
      },
      select: { id: true },
    });

    const nextStatus = rules.manualReview ? 'MANUAL_REVIEW' : 'SENT';
    assertTransition('ADMIN_SUBMITTED', nextStatus);
    await tx.freeTierApplication.updateMany({
      where: { id: app.id, status: 'ADMIN_SUBMITTED' },
      data: { status: nextStatus },
    });

    return {
      ok: true as const,
      approvalId: approval.id,
      manualReview: rules.manualReview,
      approveToken: approveMint.token,
      declineToken: declineMint.token,
      approveLinkId: approveMint.linkId,
      declineLinkId: declineMint.linkId,
      adminEmail,
      sentStatus: nextStatus,
    };
  });

  if (!result.ok) return result;
  if (!result.manualReview) {
    const base = freeTierPublicAppOrigin();
    const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(result.approveToken)}`;
    const declineUrl = `${base}/free/admin/not-right-person?t=${encodeURIComponent(result.declineToken)}`;
    const emailResult = await sendFreeTierAdminApprovalEmail({
      applicationId: app.id,
      to: result.adminEmail,
      teacherEmail: app.email,
      teacherName: app.name,
      schoolName: app.schoolName,
      approveUrl,
      notRightPersonUrl: declineUrl,
    });
    if (!emailResult.ok) {
      await abandonMintedSignedLinks([result.approveLinkId, result.declineLinkId]);
      await prisma.$transaction(async (tx) => {
        await tx.freeTierAdminApproval.delete({ where: { id: result.approvalId } });
        await tx.freeTierApplication.updateMany({
          where: {
            id: app.id,
            status: result.sentStatus === 'MANUAL_REVIEW' ? 'MANUAL_REVIEW' : 'SENT',
          },
          data: { status: 'ADMIN_SUBMITTED' },
        });
      });
      return { ok: false as const, reason: 'email_failed' as const, error: emailResult.error };
    }
  }
  return {
    ok: true as const,
    status: result.manualReview ? 'MANUAL_REVIEW' : 'SENT',
  };
}

export async function completeSchoolAdminApproval(args: {
  token: string;
  adminRole: string;
  authorized: boolean;
  request: Request;
}) {
  if (!args.authorized) return { ok: false as const, reason: 'unauthorized' as const };
  const earlyAppId = applicationIdFromSignedToken(args.token);
  if (earlyAppId) {
    const already = await prisma.freeTierApplication.findUnique({
      where: { id: earlyAppId },
      select: { status: true },
    });
    if (already?.status === 'APPROVED') return { ok: true as const, idempotent: true as const };
  }

  const meta = hashRequestMeta(args.request);
  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      if (earlyAppId) await lockApprovalApplication(tx, earlyAppId);
      const consumed = await claimSignedLinkInTransaction(tx, {
        token: args.token,
        expectedPurpose: 'ADMIN_APPROVE',
      });
      if (!consumed.ok) return consumed;

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
          releasedAt: true,
        },
      });
      if (!app) abortClaimedLinkTransaction({ ok: false, reason: 'not_found' });
      if (app.status === 'APPROVED') return { ok: true as const, idempotent: true as const };
      if (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW') {
        abortClaimedLinkTransaction({
          ok: false,
          reason: 'illegal_state',
          status: app.status,
        });
      }

      const pending = await tx.freeTierAdminApproval.findFirst({
        where: {
          applicationId: app.id,
          signedLinkId: consumed.linkId,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, adminName: true, adminEmail: true },
      });
      if (!pending) {
        const stillPending = await tx.freeTierAdminApproval.findFirst({
          where: { applicationId: app.id, status: 'PENDING' },
          select: { id: true },
        });
        if (stillPending) abortClaimedLinkTransaction({ ok: false, reason: 'superseded' });
        abortClaimedLinkTransaction({ ok: false, reason: 'not_found' });
      }

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('free_tier_release'))`;
      try {
        await assertFreeTierBudgetHeadroomForTransition(tx, {
          from: { status: app.status, releasedAt: app.releasedAt },
          to: { status: 'APPROVED', releasedAt: app.releasedAt },
        });
      } catch (error) {
        if (error instanceof FreeTierBudgetExceededError) {
          abortClaimedLinkTransaction(budgetExceededFailure(error));
        }
        throw error;
      }

      const approvalIdentity = {
        id: app.id,
        userId: app.userId,
        organizationId: app.organizationId,
      };
      const v2 = await isApprovalV2Enabled(approvalIdentity, tx);
      if (v2 && (!args.adminRole.trim() || args.adminRole.trim().length > 120))
        abortClaimedLinkTransaction({ ok: false, reason: 'validation' });
      if (v2)
        await tx.freeTierApprovalDelivery.updateMany({
          where: { approvalId: pending.id, state: 'QUEUED' },
          data: { state: 'CANCELLED', error: 'approved' },
        });
      await tx.freeTierAdminApproval.update({
        where: { id: pending.id },
        data: {
          ...(v2
            ? {
                autoRemindersStopped: true,
                stopReason: 'approved',
                nextAutoReminderAt: null,
                nextTeacherFollowUpAt: null,
              }
            : {}),
          status: 'APPROVED',
          adminRole: args.adminRole.trim(),
          decidedAt: new Date(),
          clientIpHash: meta.clientIpHash,
          userAgentHash: meta.userAgentHash,
        },
      });

      const updated = await tx.freeTierApplication.updateMany({
        where: { id: app.id, status: { in: ['SENT', 'MANUAL_REVIEW'] } },
        data: { status: 'APPROVED' },
      });
      if (updated.count === 0) abortClaimedLinkTransaction({ ok: false, reason: 'conflict' });

      await tx.freeTierApprovalDecision.create({
        data: {
          applicationId: app.id,
          decision: 'APPROVED',
          decidedByEmail: pending.adminEmail,
          reason: `School admin approval (${pending.adminName})`,
        },
      });

      return {
        ok: true as const,
        app: {
          id: app.id,
          email: app.email,
          name: app.name,
          schoolName: app.schoolName,
          userId: app.userId,
          organizationId: app.organizationId,
        },
        adminName: pending.adminName,
      };
    });
  } catch (error) {
    result = mapTransactionalAbort(error);
  }

  if (!result.ok) return result;
  if ('idempotent' in result && result.idempotent) return result;

  if (result.app) {
    await ensureFreeTierProductionApprovalHooks();
    await getApprovalHooks().onApplicationApproved(result.app);
    const signInUrl = `${freeTierPublicAppOrigin()}/auth/login`;
    const emailResult = await sendFreeTierCongratulationsEmail({
      applicationId: result.app.id,
      teacherEmail: result.app.email,
      teacherName: result.app.name,
      adminName: result.adminName,
      signInUrl,
    });
    if (!emailResult.ok) {
      return { ok: false as const, reason: 'email_failed' as const, error: emailResult.error };
    }
  }
  return result;
}

export async function resendFreeTierAdminApprovalReminder(args: {
  applicationId: string;
  request: Request;
  idempotencyKey?: string;
  actorEmail?: string;
  requireV2?: boolean;
}) {
  const identity = await prisma.freeTierApplication.findUnique({
    where: { id: args.applicationId },
    select: { id: true, userId: true, organizationId: true },
  });
  if (identity && (await isApprovalV2Enabled(identity)))
    return resendApprovalReminder({
      applicationId: args.applicationId,
      idempotencyKey: args.idempotencyKey ?? `legacy-manual:${randomUUID()}`,
      actorEmail: args.actorEmail,
    });
  // Staff writes require durable v2 delivery; teacher callers retain fallback.
  if (args.requireV2) return { ok: false as const, reason: 'flag_off' as const };
  const app = await prisma.freeTierApplication.findFirst({
    where: { id: args.applicationId, status: 'SENT' },
    select: {
      id: true,
      name: true,
      schoolName: true,
      email: true,
      organizationId: true,
    },
  });
  if (!app) return { ok: false as const, reason: 'not_allowed' as const };

  const pendingRow = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: app.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      adminEmail: true,
      redirectedFromId: true,
      forwardedByRole: true,
    },
  });
  if (!pendingRow) return { ok: false as const, reason: 'not_found' as const };

  const minted = await prisma.$transaction(async (tx) => {
    const approveMint = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });
    const declineMint = await mintSignedLink({
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });
    return { approveMint, declineMint };
  });

  const base = freeTierPublicAppOrigin();
  const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(minted.approveMint.token)}`;
  const notRightPersonUrl = `${base}/free/admin/not-right-person?t=${encodeURIComponent(minted.declineMint.token)}`;

  const pass1 = await isFeatureFlagEnabled(FREE_TIER_FLAG, app.organizationId);
  const emailContext = pass1
    ? await resolveAdminApprovalEmailContext(pendingRow, prisma, {
        organizationId: app.organizationId,
      })
    : {};
  const emailResult = await sendFreeTierAdminReminderEmail({
    applicationId: app.id,
    to: pendingRow.adminEmail,
    teacherEmail: app.email,
    teacherName: app.name,
    schoolName: app.schoolName,
    approveUrl,
    notRightPersonUrl,
    ...(pass1
      ? {
          forwardedByAdminName: emailContext.forwardedByAdminName,
          routedByTeacher: emailContext.routedByTeacher,
        }
      : {}),
  });

  if (!emailResult.ok) {
    await abandonMintedSignedLinks([minted.approveMint.linkId, minted.declineMint.linkId]);
    return { ok: false as const, reason: 'email_failed' as const, error: emailResult.error };
  }

  await prisma.$transaction(async (tx) => {
    await invalidateOpenAdminApprovalLinks(tx, app.id, {
      exceptLinkIds: [minted.approveMint.linkId, minted.declineMint.linkId],
    });
    await tx.freeTierAdminApproval.update({
      where: { id: pendingRow.id },
      data: { signedLinkId: minted.approveMint.linkId },
    });
  });

  return { ok: true as const };
}

function terminalGateFromApplication(app: {
  status: string;
  schoolName: string;
  name: string;
}): {
  ok: false;
  reason: 'already_approved' | 'declined';
  schoolName: string;
  teacherName: string;
} | null {
  if (app.status === 'APPROVED') {
    return {
      ok: false as const,
      reason: 'already_approved' as const,
      schoolName: app.schoolName,
      teacherName: app.name,
    };
  }
  if (app.status === 'REJECTED' || app.status === 'EXPIRED') {
    return {
      ok: false as const,
      reason: 'declined' as const,
      schoolName: app.schoolName,
      teacherName: app.name,
    };
  }
  return null;
}

export async function redirectSchoolAdmin(args: {
  token: string;
  newAdminName: string;
  newAdminEmail: string;
  request: Request;
}) {
  const parsed = forwardApprovalSchema.safeParse({
    newAdminName: args.newAdminName,
    newAdminEmail: args.newAdminEmail,
  });
  if (!parsed.success) {
    return {
      ok: false as const,
      reason: 'validation' as const,
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const earlyAppId = applicationIdFromSignedToken(args.token);
  if (earlyAppId) {
    const gate = await fetchFreeTierApplicationTerminalGate(earlyAppId);
    if (gate) return { ok: false as const, ...gate };
  }
  if (
    await forwardIdempotentReplay({
      token: args.token,
      newAdminName: parsed.data.newAdminName,
      newAdminEmail: parsed.data.newAdminEmail,
    })
  ) {
    return { ok: true as const, idempotent: true as const };
  }

  const peek = await peekSignedLink({
    token: args.token,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  if (!peek.ok) {
    if (
      peek.reason === 'used' &&
      (await forwardIdempotentReplay({
        token: args.token,
        newAdminName: parsed.data.newAdminName,
        newAdminEmail: parsed.data.newAdminEmail,
      }))
    ) {
      return { ok: true as const, idempotent: true as const };
    }
    const gate = await resolveAdminLinkTerminalGate({
      token: args.token,
      peek,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    if (gate) return { ok: false as const, ...gate };
    const replaced = await resolveAdminLinkReplacedGate({
      token: args.token,
      peek,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    if (replaced) return { ok: false as const, ...replaced };
    return peek;
  }

  const identity = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      status: true,
      schoolName: true,
      name: true,
    },
  });
  const preTerminal = identity ? terminalGateFromApplication(identity) : null;
  if (preTerminal) return preTerminal;

  if (identity && (await isApprovalV2Enabled(identity))) {
    return forwardApprovalByToken({
      token: args.token,
      newAdminName: parsed.data.newAdminName,
      newAdminEmail: parsed.data.newAdminEmail,
      request: args.request,
    });
  }

  const newEmail = parsed.data.newAdminEmail;
  const meta = hashRequestMeta(args.request);
  const copyHash = await adminApprovalEmailCopyVersionHash();

  const preApp = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: { id: true, email: true, name: true, schoolName: true, status: true, adminRedirectCount: true },
  });
  if (!preApp) return { ok: false as const, reason: 'not_found' as const };
  const appGate = terminalGateFromApplication(preApp);
  if (appGate) return appGate;
  if (preApp.status !== 'SENT' && preApp.status !== 'MANUAL_REVIEW') {
    return {
      ok: false as const,
      reason: 'illegal_state' as const,
      status: preApp.status,
    };
  }
  if (preApp.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP) {
    return { ok: false as const, reason: 'chain_cap' as const };
  }

  const prePending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: preApp.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, adminName: true },
  });
  if (!prePending) {
    const decided = await fetchFreeTierApplicationTerminalGate(preApp.id);
    if (decided) return { ok: false as const, ...decided };
    return { ok: false as const, reason: 'not_found' as const };
  }

  const rules = evaluateAdminEmailForRuntime(
    {
    teacherEmail: preApp.email,
    adminEmail: newEmail,
    schoolName: preApp.schoolName,
  },
    resolveFreeTierRuntimeEnvironment()
  );

  const newAdminNameTrim = parsed.data.newAdminName;

  const minted = await prisma.$transaction(async (tx) => {
    const approveMint = await mintSignedLink({
      applicationId: preApp.id,
      purpose: 'ADMIN_APPROVE',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });
    const declineMint = await mintSignedLink({
      applicationId: preApp.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
      ttlMs: FREE_TIER_LINK_TTL_MS,
      tx,
    });
    return { approveMint, declineMint };
  });

  const base = freeTierPublicAppOrigin();
  const approveUrl = `${base}/free/admin/approve?t=${encodeURIComponent(minted.approveMint.token)}`;
  const notRightPersonUrl = `${base}/free/admin/not-right-person?t=${encodeURIComponent(minted.declineMint.token)}`;

  if (!rules.manualReview) {
    const emailResult = await sendFreeTierAdminApprovalEmail({
      applicationId: preApp.id,
      to: newEmail,
      teacherEmail: preApp.email,
      teacherName: preApp.name,
      schoolName: preApp.schoolName,
      approveUrl,
      notRightPersonUrl,
      adminRecipientName: newAdminNameTrim,
      forwardedByAdminName: prePending.adminName,
    });
    if (!emailResult.ok) {
      await abandonMintedSignedLinks([minted.approveMint.linkId, minted.declineMint.linkId]);
      return { ok: false as const, reason: 'email_failed' as const, error: emailResult.error };
    }
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
    const app = await tx.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: { id: true, email: true, name: true, schoolName: true, status: true, adminRedirectCount: true },
    });
    if (!app) return { ok: false as const, reason: 'not_found' as const };
    const txGate = terminalGateFromApplication(app);
    if (txGate) return txGate;
    if (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW') {
      return { ok: false as const, reason: 'illegal_state' as const };
    }
    if (app.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP) {
      return { ok: false as const, reason: 'chain_cap' as const };
    }

    const pending = await tx.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, personalNote: true },
    });
    if (!pending) return { ok: false as const, reason: 'not_found' as const };

    const consumed = await claimSignedLinkInTransaction(tx, {
      token: args.token,
      expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    if (!consumed.ok) return consumed;
    if (consumed.applicationId !== app.id) {
      abortClaimedLinkTransaction({ ok: false, reason: 'invalid' });
    }

    await tx.freeTierAdminApproval.update({
      where: { id: pending.id },
      data: {
        status: 'REDIRECTED',
        decidedAt: new Date(),
        clientIpHash: meta.clientIpHash,
        userAgentHash: meta.userAgentHash,
      },
    });

    await tx.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: newAdminNameTrim,
        adminEmail: newEmail,
        status: 'PENDING',
        signedLinkId: minted.approveMint.linkId,
        emailCopyVersionHash: copyHash,
        redirectedFromId: pending.id,
        personalNote: pending.personalNote,
      },
    });

    await invalidateOpenAdminApprovalLinks(tx, app.id, {
      exceptLinkIds: [minted.approveMint.linkId, minted.declineMint.linkId],
    });

    await tx.freeTierApplication.update({
      where: { id: app.id },
      data: {
        adminRedirectCount: { increment: 1 },
        status: rules.manualReview ? 'MANUAL_REVIEW' : 'SENT',
      },
    });

    return { ok: true as const };
    });
  } catch (error) {
    result = mapTransactionalAbort(error);
  }

  if (!result.ok) return result;
  if ('idempotent' in result && result.idempotent) return result;
  return { ok: true as const };
}

export async function createFreeTierTeacherAccount(args: {
  token: string;
  name: string;
  passwordHash: string;
}) {
  const earlyAppId = applicationIdFromSignedToken(args.token);
  if (earlyAppId) {
    const invited = await prisma.freeTierApplication.findUnique({
      where: { id: earlyAppId },
      select: { userId: true },
    });
    if (invited?.userId) {
      return { ok: true as const, idempotent: true as const, userId: invited.userId };
    }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const appId = applicationIdFromSignedToken(args.token);
      if (!appId) return { ok: false as const, reason: 'invalid' as const };

      const preApp = await tx.freeTierApplication.findUnique({
        where: { id: appId },
        select: { id: true, status: true, email: true, userId: true },
      });
      if (!preApp) return { ok: false as const, reason: 'not_found' as const };
      if (preApp.userId) return { ok: true as const, idempotent: true as const, userId: preApp.userId };

      const existingUser = await tx.user.findUnique({
        where: { email: preApp.email },
        select: { id: true, password: { select: { userId: true } } },
      });
      if (existingUser?.password) {
        await tx.freeTierApplication.updateMany({
          where: { id: preApp.id, userId: null },
          data: { userId: existingUser.id, status: 'ACCOUNT_CREATED' },
        });
        return { ok: false as const, reason: 'sign_in_required' as const };
      }

      const consumed = await claimSignedLinkInTransaction(tx, {
        token: args.token,
        expectedPurpose: 'RELEASE',
      });
      if (!consumed.ok) return consumed;

      const app = await tx.freeTierApplication.findUnique({
        where: { id: consumed.applicationId },
        select: { id: true, status: true, email: true, userId: true },
      });
      if (!app) abortClaimedLinkTransaction({ ok: false, reason: 'not_found' });
      if (app.userId) return { ok: true as const, idempotent: true as const, userId: app.userId };

      if (app.status !== 'INVITED') {
        abortClaimedLinkTransaction({
          ok: false,
          reason: 'illegal_state',
          status: app.status,
        });
      }

      assertTransition('INVITED', 'ACCOUNT_CREATED');
      const userId = existingUser
        ? (
            await tx.user.update({
              where: { id: existingUser.id },
              data: {
                name: args.name.trim(),
                password: {
                  upsert: {
                    create: { hash: args.passwordHash },
                    update: { hash: args.passwordHash },
                  },
                },
              },
              select: { id: true },
            })
          ).id
        : (
            await tx.user.create({
              data: {
                email: app.email,
                name: args.name.trim(),
                password: { create: { hash: args.passwordHash } },
              },
              select: { id: true },
            })
          ).id;
      const updated = await tx.freeTierApplication.updateMany({
        where: { id: app.id, status: 'INVITED', userId: null },
        data: { status: 'ACCOUNT_CREATED', userId },
      });
      if (updated.count === 0) abortClaimedLinkTransaction({ ok: false, reason: 'conflict' });
      return { ok: true as const, userId, email: app.email };
    });
  } catch (error) {
    return mapTransactionalAbort(error);
  }
}
