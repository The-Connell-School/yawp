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
  consumeSignedLink,
  FREE_TIER_LINK_TTL_MS,
} from './signed-link.server';
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
  for (const id of applicationIds) {
    const app = await prisma.freeTierApplication.findUnique({
      where: { id, status: 'INVITED' },
      select: { id: true, email: true, name: true, schoolName: true },
    });
    if (!app) continue;
    await sendFreeTierReleaseEmail({
      applicationId: app.id,
      email: app.email,
      name: app.name,
      schoolName: app.schoolName,
    });
  }
}

export async function submitAdminDetails(args: {
  applicationId: string;
  userId: string;
  adminName: string;
  adminEmail: string;
  adminRole: string;
  personalNote?: string;
  requestBaseUrl: string;
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
  if (!rules.ok) return { ok: false as const, reason: rules.reason };

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
    const approveUrl = `${args.requestBaseUrl}/free/admin/approve?t=${encodeURIComponent(result.approveToken)}`;
    const declineUrl = `${args.requestBaseUrl}/free/admin/not-right-person?t=${encodeURIComponent(result.declineToken)}`;
    await sendFreeTierAdminApprovalEmail({
      applicationId: app.id,
      to: result.adminEmail,
      teacherName: app.name,
      schoolName: app.schoolName,
      personalNote: note,
      approveUrl,
      notRightPersonUrl: declineUrl,
    });
  }
  return {
    ok: true as const,
    status: result.manualReview ? 'MANUAL_REVIEW' : 'SENT',
    approveToken: result.approveToken,
  };
}

export async function completeSchoolAdminApproval(args: {
  token: string;
  adminRole: string;
  authorized: boolean;
  request: Request;
  requestBaseUrl: string;
}) {
  if (!args.authorized) return { ok: false as const, reason: 'unauthorized' as const };
  const peek = await import('./signed-link.server').then((m) =>
    m.peekSignedLink({ token: args.token, expectedPurpose: 'ADMIN_APPROVE' })
  );
  if (peek.ok) {
    const already = await prisma.freeTierApplication.findUnique({
      where: { id: peek.applicationId },
      select: { status: true },
    });
    if (already?.status === 'APPROVED') return { ok: true as const, idempotent: true as const };
  }
  const consumed = await consumeSignedLink({ token: args.token, expectedPurpose: 'ADMIN_APPROVE' });
  if (!consumed.ok) return { ok: false as const, reason: consumed.reason };

  const meta = hashRequestMeta(args.request);
  const result = await prisma.$transaction(async (tx) => {
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
      where: { applicationId: app.id, signedLinkId: consumed.linkId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, adminName: true, adminEmail: true },
    });
    if (!pending) return { ok: false as const, reason: 'not_found' as const };

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

  if (result.ok && !('idempotent' in result) && result.app) {
    await getApprovalHooks().onApplicationApproved(result.app);
    await sendFreeTierCongratulationsEmail({
      applicationId: result.app.id,
      teacherEmail: result.app.email,
      teacherName: result.app.name,
      adminName: result.adminName,
      signInUrl: `${args.requestBaseUrl}/auth/login`,
    });
  }
  return result;
}

export async function redirectSchoolAdmin(args: {
  token: string;
  newAdminName: string;
  newAdminEmail: string;
  request: Request;
  requestBaseUrl: string;
}) {
  const consumed = await consumeSignedLink({ token: args.token, expectedPurpose: 'ADMIN_NOT_RIGHT_PERSON' });
  if (!consumed.ok) return { ok: false as const, reason: consumed.reason };

  const newEmail = normalizeEmail(args.newAdminEmail);
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: consumed.applicationId },
    select: { id: true, email: true, name: true, schoolName: true, status: true, adminRedirectCount: true },
  });
  if (!app || (app.status !== 'SENT' && app.status !== 'MANUAL_REVIEW')) {
    return { ok: false as const, reason: 'illegal_state' as const };
  }
  if (app.adminRedirectCount >= ADMIN_REDIRECT_CHAIN_CAP) {
    return { ok: false as const, reason: 'chain_cap' as const };
  }

  const rules = evaluateAdminEmail({ teacherEmail: app.email, adminEmail: newEmail, schoolName: app.schoolName });
  if (!rules.ok) return { ok: false as const, reason: rules.reason };

  const meta = hashRequestMeta(args.request);
  const copyHash = adminApprovalEmailCopyVersionHash();

  const result = await prisma.$transaction(async (tx) => {
    const pending = await tx.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, signedLinkId: consumed.linkId, status: 'PENDING' },
      select: { id: true, personalNote: true },
    });
    if (!pending) return { ok: false as const, reason: 'not_found' as const };

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

    const next = await tx.freeTierAdminApproval.create({
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
      select: { id: true },
    });

    await tx.freeTierApplication.update({
      where: { id: app.id },
      data: {
        adminRedirectCount: { increment: 1 },
        status: rules.manualReview ? 'MANUAL_REVIEW' : 'SENT',
      },
    });

    return { ok: true as const, approveToken: approveMint.token, declineToken: declineMint.token, note: pending.personalNote };
  });

  if (!result.ok) return result;
  if (app.status !== 'MANUAL_REVIEW' && !rules.manualReview) {
    const approveUrl = `${args.requestBaseUrl}/free/admin/approve?t=${encodeURIComponent(result.approveToken)}`;
    const declineUrl = `${args.requestBaseUrl}/free/admin/not-right-person?t=${encodeURIComponent(result.declineToken)}`;
    await sendFreeTierAdminApprovalEmail({
      applicationId: app.id,
      to: newEmail,
      teacherName: app.name,
      schoolName: app.schoolName,
      personalNote: result.note,
      approveUrl,
      notRightPersonUrl: declineUrl,
    });
  }
  return { ok: true as const };
}

export async function createFreeTierTeacherAccount(args: {
  token: string;
  name: string;
  passwordHash: string;
}) {
  const consumed = await consumeSignedLink({ token: args.token, expectedPurpose: 'RELEASE' });
  if (!consumed.ok) return { ok: false as const, reason: consumed.reason };

  return prisma.$transaction(async (tx) => {
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
