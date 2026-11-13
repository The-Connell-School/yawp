import { sendEmail } from '~/utils/email.server';
import { prisma } from '~/utils/db.server';
import { peekSignedLink } from './signed-link.server';
import { BELOW_HS_TAG } from './grade-gate';
import { FREE_TIER_HELLO_EMAIL } from './admin-approval-copy';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';
import { assertFreeTierRuntimeConfigured } from './free-tier-config.server';
import { safeErrorTextForLog } from '~/utils/server-error-request-context.server';
import type { EmailSendResult } from './email.server';

export const TEAM_CONTACT_BELOW_HS_KIND = 'team_contact_below_hs';
export const TEAM_CONTACT_ADMIN_LEARN_MORE_KIND = 'team_contact_admin_learn_more';
export const TEAM_CONTACT_IDEMPOTENCY_MS = 10 * 60 * 1000;

type ApplicationContactFields = {
  id: string;
  name: string;
  email: string;
  schoolName: string;
  location: string;
  gradeLevel: string;
  tags: string[];
};

async function recentSuccessfulTeamContact(
  applicationId: string,
  kind: string
): Promise<boolean> {
  const since = new Date(Date.now() - TEAM_CONTACT_IDEMPOTENCY_MS);
  const row = await prisma.freeTierEmailLog.findFirst({
    where: {
      applicationId,
      kind,
      success: true,
      createdAt: { gte: since },
    },
    select: { id: true },
  });
  return Boolean(row);
}

async function logTeamContact(args: {
  applicationId: string;
  kind: string;
  success: boolean;
  error?: string;
  payload?: Record<string, string>;
}) {
  try {
    await prisma.freeTierEmailLog.create({
      data: {
        applicationId: args.applicationId,
        kind: args.kind,
        toEmail: FREE_TIER_HELLO_EMAIL,
        success: args.success,
        error: args.error ?? null,
        payload: sanitizeFreeTierEmailLogPayload(args.payload) ?? undefined,
      },
    });
  } catch {
    // logging must not break the flow
  }
}

function formatApplicationBlock(app: ApplicationContactFields) {
  return [
    `Application ID: ${app.id}`,
    `Teacher: ${app.name}`,
    `Email: ${app.email}`,
    `School: ${app.schoolName}`,
    `Location: ${app.location}`,
    `Grade level: ${app.gradeLevel}`,
    `Tags: ${app.tags.length ? app.tags.join(', ') : '(none)'}`,
  ].join('\n');
}

async function deliverTeamContactEmail(args: {
  applicationId: string;
  kind: string;
  subject: string;
  text: string;
}): Promise<EmailSendResult> {
  if (await recentSuccessfulTeamContact(args.applicationId, args.kind)) {
    return { ok: true };
  }
  try {
    assertFreeTierRuntimeConfigured();
    const result = await sendEmail({
      to: FREE_TIER_HELLO_EMAIL,
      subject: args.subject,
      text: args.text,
      html: args.text.replace(/\n/g, '<br>\n'),
    });
    if (result.status !== 'success') {
      const message =
        result.error?.message?.trim() || 'email_send_failed';
      const error = safeErrorTextForLog(new Error(message));
      await logTeamContact({
        applicationId: args.applicationId,
        kind: args.kind,
        success: false,
        error,
      });
      return { ok: false, error };
    }
    await logTeamContact({
      applicationId: args.applicationId,
      kind: args.kind,
      success: true,
    });
    return { ok: true };
  } catch (error) {
    const message = safeErrorTextForLog(error);
    await logTeamContact({
      applicationId: args.applicationId,
      kind: args.kind,
      success: false,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function sendBelowHsTeamContact(args: {
  applicationId: string;
}): Promise<EmailSendResult> {
  const app = await prisma.freeTierApplication.findUnique({
    where: { id: args.applicationId },
    select: {
      id: true,
      name: true,
      email: true,
      schoolName: true,
      location: true,
      gradeLevel: true,
      tags: true,
      status: true,
    },
  });
  if (!app || !app.tags.includes(BELOW_HS_TAG)) {
    return { ok: false, error: 'invalid_application' };
  }
  const text = [
    'A below–high-school teacher asked to talk with the Yawp! team after signing up for free access.',
    '',
    formatApplicationBlock(app),
    '',
    `Application status: ${app.status}`,
  ].join('\n');
  return deliverTeamContactEmail({
    applicationId: app.id,
    kind: TEAM_CONTACT_BELOW_HS_KIND,
    subject: 'Free tier: below-HS teacher wants to talk',
    text,
  });
}

export async function sendAdminLearnMoreTeamContact(args: {
  token: string;
  adminRole?: string;
}): Promise<
  | ({ ok: true } & { learnMoreSent: true })
  | { ok: false; reason: 'invalid' | 'email_failed'; error?: string }
> {
  const token = args.token.trim();
  if (!token) return { ok: false, reason: 'invalid' };
  const peek = await peekSignedLink({
    token,
    expectedPurpose: 'ADMIN_APPROVE',
  });
  if (!peek.ok) return { ok: false, reason: 'invalid' };

  const app = await prisma.freeTierApplication.findUnique({
    where: { id: peek.applicationId },
    select: {
      id: true,
      name: true,
      email: true,
      schoolName: true,
      location: true,
      gradeLevel: true,
      tags: true,
    },
  });
  if (!app) return { ok: false, reason: 'invalid' };

  const pending = await prisma.freeTierAdminApproval.findFirst({
    where: {
      applicationId: app.id,
      signedLinkId: peek.linkId,
      status: 'PENDING',
    },
    orderBy: { createdAt: 'desc' },
    select: { adminName: true, adminEmail: true },
  });

  const adminRole = args.adminRole?.trim() || '(not provided)';
  const adminName = pending?.adminName?.trim() || '(not provided)';
  const adminEmail = pending?.adminEmail?.trim() || '(not provided)';

  const text = [
    'A school admin opened the approval page and asked to learn more before approving.',
    '',
    `Admin name: ${adminName}`,
    `Admin email: ${adminEmail}`,
    `Admin role (from page): ${adminRole}`,
    '',
    formatApplicationBlock(app),
  ].join('\n');

  const delivered = await deliverTeamContactEmail({
    applicationId: app.id,
    kind: TEAM_CONTACT_ADMIN_LEARN_MORE_KIND,
    subject: 'Free tier: admin wants to learn more before approving',
    text,
  });
  if (!delivered.ok) {
    return { ok: false, reason: 'email_failed', error: delivered.error };
  }
  return { ok: true, learnMoreSent: true };
}
