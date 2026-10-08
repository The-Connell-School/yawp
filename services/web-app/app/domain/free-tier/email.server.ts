import { sendEmail } from '~/utils/email.server';
import { prisma } from '~/utils/db.server';
import {
  renderAdminApprovalEmailBody,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
} from './email-copy.server';
import { mintSignedLink, RELEASE_LINK_TTL_MS } from './signed-link.server';
import { freeTierPublicAppOrigin } from './free-tier-public-url.server';
import { plainTextEmailToHtml } from './email-html.server';
import { sanitizeFreeTierEmailLogPayload } from './email-log-payload.server';
import { assertFreeTierRuntimeConfigured } from './free-tier-config.server';

export type EmailSendResult = { ok: true } | { ok: false; error: string };

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

export async function sendFreeTierReleaseEmail(payload: ReleaseEmailPayload): Promise<EmailSendResult> {
  try {
    assertFreeTierRuntimeConfigured();
    const base = freeTierPublicAppOrigin();
    const minted = await mintSignedLink({
      applicationId: payload.applicationId,
      purpose: 'RELEASE',
      ttlMs: RELEASE_LINK_TTL_MS,
    });
    const joinUrl = `${base}/free/join?t=${encodeURIComponent(minted.token)}`;
    const text = renderReleaseEmailBody({ name: payload.name, joinUrl });
    const html = plainTextEmailToHtml(text);
    await sendEmail({
      to: payload.email,
      subject: "You're in — start your YAWP classroom",
      html,
      text,
    });
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
}): Promise<EmailSendResult> {
  const text = renderAdminApprovalEmailBody({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    personalNote: args.personalNote,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
  });
  try {
    assertFreeTierRuntimeConfigured();
    const html = plainTextEmailToHtml(text);
    await sendEmail({
      to: args.to,
      subject: `Approve YAWP for ${args.schoolName}`,
      html,
      text,
    });
    await logEmail({
      applicationId: args.applicationId,
      kind: 'admin_approval',
      toEmail: args.to,
      success: true,
      payload: { approveUrl: args.approveUrl, notRightPersonUrl: args.notRightPersonUrl },
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await logEmail({
      applicationId: args.applicationId,
      kind: 'admin_approval',
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
  const text = renderCongratulationsEmailBody({
    teacherName: args.teacherName,
    adminName: args.adminName,
    signInUrl: args.signInUrl,
  });
  try {
    assertFreeTierRuntimeConfigured();
    const html = plainTextEmailToHtml(text);
    await sendEmail({
      to: args.teacherEmail,
      subject: `${args.adminName} approved YAWP for your classroom`,
      html,
      text,
    });
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
    applicationId: args.applicationId,
    to: args.to,
    teacherEmail: args.teacherEmail,
    teacherName: args.teacherName,
    schoolName: args.schoolName,
    personalNote: args.personalNote,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
  });
}
