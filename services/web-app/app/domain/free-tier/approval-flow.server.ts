import { createHash } from 'node:crypto';
import { prisma } from '~/utils/db.server';
import { assertTransition } from './state';
import { normalizeEmail } from './service.server';
import {
  ADMIN_REDIRECT_CHAIN_CAP,
  evaluateAdminEmail,
} from './admin-email-rules.server';
import { adminApprovalEmailCopyVersionHash } from './email-copy.server';
import {
  mintSignedLink,
  claimSignedLinkInTransaction,
  applicationIdFromSignedToken,
  FREE_TIER_LINK_TTL_MS,
  peekSignedLink,
  invalidateOpenAdminApprovalLinks,
} from './signed-link.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import { ensureFreeTierProductionApprovalHooks } from './approval-hooks.server';
import {
  sendFreeTierAdminApprovalEmail,
  sendFreeTierCongratulationsEmail,
  sendFreeTierReleaseEmail,
} from './email.server';
import { getApprovalHooks } from './approval-hooks.server';
import { getClientIp } from '~/utils/ip.server';

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
    select: { id: true, status: true, email: true, name: true, schoolName: true, teacherPersonalNote: true },
  });
  if (!app) return { ok: false as const, reason: 'not_found' as const };
  if (app.status !== 'ACCOUNT_CREATED' && app.status !== 'ADMIN_SUBMITTED') {
    return { ok: false as const, reason: 'illegal_state' as const, status: app.status };
  }

  const rules = evaluateAdminEmail({ teacherEmail: app.email, adminEmail, schoolName: app.schoolName });

  const copyHash = adminApprovalEmailCopyVersionHash();
  const note = args.personalNote?.trim() || null;

  const result = await prisma.$transaction(async (tx) => {
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
      adminEmail,
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
      personalNote: note,
      approveUrl,
      notRightPersonUrl: declineUrl,
    });
    if (!emailResult.ok) {
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
  const result = await prisma.$transaction(async (tx) => {
    const consumed = await claimSignedLinkInTransaction(tx, {
      token: args.token,
      expectedPurpose: 'ADMIN_APPROVE',
    });
    if (!consumed.ok) return consumed;

    const app = await tx.freeTierApplication.findUnique({
      where: { id: consumed.applicationId },
      select: { id: true, status: true, email: true, name: true, schoolName: true, userId: true, organizationId: true },
    });
    if (!app) return { ok: false as const, reason: 'not_found' as const };
    if (app.status === 'APPROVED') return { ok: true as const, idempotent: true as const };
    if (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW') {
      return { ok: false as const, reason: 'illegal_state' as const, status: app.status };
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
      if (stillPending) return { ok: false as const, reason: 'superseded' as const };
      return { ok: false as const, reason: 'not_found' as const };
    }

    await tx.freeTierAdminApproval.update({
      where: { id: pending.id },
      data: {
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
    if (updated.count === 0) return { ok: false as const, reason: 'conflict' as const };

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

export async function redirectSchoolAdmin(args: {
  token: string;
  newAdminName: string;
  newAdminEmail: string;
  request: Request;
}) {
  const newEmail = normalizeEmail(args.newAdminEmail);
  const meta = hashRequestMeta(args.request);
  const copyHash = adminApprovalEmailCopyVersionHash();

  const peek = await peekSignedLink({
    token: args.token,
    expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON',
  });
  if (!peek.ok) return peek;

  const preApp = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: { id: true, email: true, name: true, schoolName: true, status: true, adminRedirectCount: true },
  });
  if (!preApp || (preApp.status !== 'SENT' && preApp.status !== 'MANUAL_REVIEW')) {
    return { ok: false as const, reason: 'illegal_state' as const };
  }
  if (preApp.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP) {
    return { ok: false as const, reason: 'chain_cap' as const };
  }

  const prePending = await prisma.freeTierAdminApproval.findFirst({
    where: { applicationId: preApp.id, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (!prePending) return { ok: false as const, reason: 'not_found' as const };

  const rules = evaluateAdminEmail({
    teacherEmail: preApp.email,
    adminEmail: newEmail,
    schoolName: preApp.schoolName,
  });

  const result = await prisma.$transaction(async (tx) => {
    const app = await tx.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: { id: true, email: true, name: true, schoolName: true, status: true, adminRedirectCount: true },
    });
    if (!app || (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW')) {
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
      return { ok: false as const, reason: 'invalid' as const };
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

    const approveMint = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_APPROVE', tx });
    const declineMint = await mintSignedLink({ applicationId: app.id, purpose: 'ADMIN_NOT_RIGHT_PERSON', tx });

    await tx.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: args.newAdminName.trim(),
        adminEmail: newEmail,
        status: 'PENDING',
        signedLinkId: approveMint.linkId,
        emailCopyVersionHash: copyHash,
        redirectedFromId: pending.id,
        personalNote: pending.personalNote,
      },
    });

    await tx.freeTierApplication.update({
      where: { id: app.id },
      data: {
        adminRedirectCount: { increment: 1 },
        status: rules.manualReview ? 'MANUAL_REVIEW' : 'SENT',
      },
    });

    return {
      ok: true as const,
      app,
      rules,
      approveToken: approveMint.token,
      declineToken: declineMint.token,
      note: pending.personalNote,
      to: newEmail,
    };
  });

  if (!result.ok) return result;
  if (result.app.status !== 'MANUAL_REVIEW' && !result.rules.manualReview) {
    const base = freeTierPublicAppOrigin();
    const emailResult = await sendFreeTierAdminApprovalEmail({
      applicationId: result.app.id,
      to: result.to,
      teacherEmail: result.app.email,
      teacherName: result.app.name,
      schoolName: result.app.schoolName,
      personalNote: result.note,
      approveUrl: `${base}/free/admin/approve?t=${encodeURIComponent(result.approveToken)}`,
      notRightPersonUrl: `${base}/free/admin/not-right-person?t=${encodeURIComponent(result.declineToken)}`,
    });
    if (!emailResult.ok) {
      return { ok: false as const, reason: 'email_failed' as const, error: emailResult.error };
    }
  }
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
      select: { email: true, userId: true, status: true },
    });
    if (invited?.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: invited.email },
        select: { id: true },
      });
      if (existingUser) {
        await prisma.freeTierApplication.updateMany({
          where: { id: earlyAppId, userId: null },
          data: { userId: existingUser.id, status: 'ACCOUNT_CREATED' },
        });
        return { ok: false as const, reason: 'sign_in_required' as const };
      }
    }
    if (invited?.userId) {
      return { ok: true as const, idempotent: true as const, userId: invited.userId };
    }
  }

  return prisma.$transaction(async (tx) => {
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
      select: { id: true },
    });
    if (existingUser) {
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
    if (!app) return { ok: false as const, reason: 'not_found' as const };
    if (app.userId) return { ok: true as const, idempotent: true as const, userId: app.userId };

    if (app.status !== 'INVITED') return { ok: false as const, reason: 'illegal_state' as const, status: app.status };

    assertTransition('INVITED', 'ACCOUNT_CREATED');
    const user = await tx.user.create({
      data: {
        email: app.email,
        name: args.name.trim(),
        password: { create: { hash: args.passwordHash } },
      },
      select: { id: true },
    });
    const updated = await tx.freeTierApplication.updateMany({
      where: { id: app.id, status: 'INVITED', userId: null },
      data: { status: 'ACCOUNT_CREATED', userId: user.id },
    });
    if (updated.count === 0) return { ok: false as const, reason: 'conflict' as const };
    return { ok: true as const, userId: user.id, email: app.email };
  });
}
