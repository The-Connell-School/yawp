import { sendEmail } from '~/utils/email.server';
import { prisma } from '~/utils/db.server';
import {
  ADMIN_APPROVAL_EMAIL_COPY_VERSION,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
} from './email-copy.server';
import {
  CONGRATULATIONS_V2_SUBJECT,
  isOnboardingV2CopyVersion,
  renderReleaseEmailSubject,
} from './email-copy';
import { mintSignedLink, RELEASE_LINK_TTL_MS } from './signed-link.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import { plainTextEmailToHtml } from './email-html.server';
import { buildDesignedAdminApprovalEmail } from './admin-approval-email.server';
import {
  buildTeacherApprovedDesignedEmail,
  buildTeacherReleaseDesignedEmail,
} from '~/emails/build-free-tier-emails.server';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';
import { assertFreeTierRuntimeConfigured } from './free-tier-config.server';
import { resolveFreeTierRuntimeEnvironment } from './usage-budget.server';

export type EmailSendResult = { ok: true } | { ok: false; error: string };

function emailSendErrorMessage(result: {
  status: string;
  error?: { message?: string };
}) {
  if (result.status === 'success') return null;
  const message = result.error?.message?.trim();
  return message || 'email_send_failed';
}

async function deliverEmail(args: {
  to: string;
  bcc?: string[];
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailSendResult> {
  const html = args.html ?? plainTextEmailToHtml(args.text);
  const result = await sendEmail({
    to: args.to,
    ...(args.bcc?.length ? { bcc: args.bcc } : {}),
    subject: args.subject,
    html,
    text: args.text,
  });
  const error = emailSendErrorMessage(result);
  if (error) return { ok: false, error };
  return { ok: true };
}

async function logEmail(args: {
  applicationId: string;
  kind: string;
  toEmail: string;
  success: boolean;
  error?: string;
  payload?: Record<string, string>;
}) {
  try {
    await prisma.freeTierEmailLog.create({
      data: {
        applicationId: args.applicationId,
        kind: args.kind,
        toEmail: args.toEmail,
        success: args.success,
        error: args.error ?? null,
        payload: sanitizeFreeTierEmailLogPayload(args.payload) ?? undefined,
      },
    });
  } catch {
    // logging must not break the flow
  }
}

export interface ReleaseEmailPayload {
  applicationId: string;
  email: string;
  name: string;
  schoolName: string;
  label?: string;
}

export async function sendFreeTierReleaseEmail(
  payload: ReleaseEmailPayload
): Promise<EmailSendResult> {
  try {
    assertFreeTierRuntimeConfigured();
    // Read the first-write application context for every caller, including
    // delayed release/retries. Never infer copy from the current rollout flag.
    const application = await prisma.freeTierApplication.findUniqueOrThrow({
      where: { id: payload.applicationId }, select: { releaseEmailCopyVersion: true },
    });
    const copyVersion = application.releaseEmailCopyVersion ?? undefined;
    const base = freeTierPublicAppOrigin();
    const minted = await mintSignedLink({
      applicationId: payload.applicationId,
      purpose: 'RELEASE',
      ttlMs: RELEASE_LINK_TTL_MS,
    });
    const joinUrl = `${base}/free/join?t=${encodeURIComponent(minted.token)}`;
    const text = renderReleaseEmailBody({ name: payload.name, joinUrl, copyVersion });
    const designed = isOnboardingV2CopyVersion(copyVersion)
      ? await buildTeacherReleaseDesignedEmail({
          name: payload.name,
          joinUrl,
        })
      : null;
    const delivered = await deliverEmail({
      to: payload.email,
      subject: designed?.subject ?? renderReleaseEmailSubject({ copyVersion }),
      text: designed?.text ?? text,
      html: designed?.html,
    });
    if (!delivered.ok) {
      await logEmail({
        applicationId: payload.applicationId,
        kind: 'release',
        toEmail: payload.email,
        success: false,
        error: delivered.error,
        payload: { joinUrl },
      });
      return delivered;
    }
    await logEmail({
      applicationId: payload.applicationId,
      kind: 'release',
      toEmail: payload.email,
      success: true,
      payload: { joinUrl },
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logEmail({
      applicationId: payload.applicationId,
      kind: 'release',
      toEmail: payload.email,
      success: false,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function sendFreeTierAdminApprovalEmail(args: {
  applicationId: string;
  to: string;
  teacherEmail: string;
  teacherName: string;
  schoolName: string;
  personalNote?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
  adminRecipientName?: string | null;
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
  isReminder?: boolean;
}): Promise<EmailSendResult> {
  const { subject, text, html } = await buildDesignedAdminApprovalEmail({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    routedByTeacher: args.routedByTeacher,
    reminder: args.isReminder,
  });
  try {
    assertFreeTierRuntimeConfigured();
    const result = await sendEmail({
      to: args.to,
      ...(resolveFreeTierRuntimeEnvironment() === 'demo'
        ? { bcc: [args.teacherEmail] }
        : {}),
      subject,
      text,
      html,
    });
    const error = emailSendErrorMessage(result);
    const delivered = error ? { ok: false as const, error } : { ok: true as const };
    if (!delivered.ok) {
      await logEmail({
        applicationId: args.applicationId,
        kind: args.isReminder ? 'admin_approval_reminder' : 'admin_approval',
        toEmail: args.to,
        success: false,
        error: delivered.error,
        payload: {
          approveUrl: args.approveUrl,
          notRightPersonUrl: args.notRightPersonUrl,
        },
      });
      return delivered;
    }
    await logEmail({
      applicationId: args.applicationId,
      kind: args.isReminder ? 'admin_approval_reminder' : 'admin_approval',
      toEmail: args.to,
      success: true,
      payload: {
        approveUrl: args.approveUrl,
        notRightPersonUrl: args.notRightPersonUrl,
      },
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logEmail({
      applicationId: args.applicationId,
      kind: args.isReminder ? 'admin_approval_reminder' : 'admin_approval',
      toEmail: args.to,
      success: false,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function sendFreeTierCongratulationsEmail(args: {
  applicationId: string;
  teacherEmail: string;
  teacherName: string;
  adminName: string;
  signInUrl: string;
}): Promise<EmailSendResult> {
  try {
    assertFreeTierRuntimeConfigured();
    // Copy follows the version stored with the application, never the live flag.
    const application = await prisma.freeTierApplication.findUnique({
      where: { id: args.applicationId }, select: { releaseEmailCopyVersion: true },
    });
    const v2 = isOnboardingV2CopyVersion(application?.releaseEmailCopyVersion);
    const designed = v2
      ? await buildTeacherApprovedDesignedEmail(args)
      : null;
    const text = designed?.text
      ?? renderCongratulationsEmailBody({
          teacherName: args.teacherName,
          adminName: args.adminName,
          signInUrl: args.signInUrl,
        });
    const delivered = await deliverEmail({
      to: args.teacherEmail,
      subject: designed?.subject
        ?? (v2
          ? CONGRATULATIONS_V2_SUBJECT
          : `${args.adminName} approved Yawp! for your classroom`),
      text,
      html: designed?.html,
    });
    if (!delivered.ok) {
      await logEmail({
        applicationId: args.applicationId,
        kind: 'congratulations',
        toEmail: args.teacherEmail,
        success: false,
        error: delivered.error,
      });
      return delivered;
    }
    await logEmail({
      applicationId: args.applicationId,
      kind: 'congratulations',
      toEmail: args.teacherEmail,
      success: true,
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logEmail({
      applicationId: args.applicationId,
      kind: 'congratulations',
      toEmail: args.teacherEmail,
      success: false,
      error: message,
    });
    return { ok: false, error: message };
  }
}

export async function sendFreeTierAdminReminderEmail(args: {
  applicationId: string;
  to: string;
  teacherEmail: string;
  teacherName: string;
  schoolName: string;
  personalNote?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
}) {
  return sendFreeTierAdminApprovalEmail({
    ...args,
    isReminder: true,
  });
}

export { ADMIN_APPROVAL_EMAIL_COPY_VERSION };
