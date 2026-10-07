import { sendEmail } from '~/utils/email.server';
function publicAppOrigin() {
  return (
    process.env.PRIMARY_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    'https://yawp.school'
  );
}
import { prisma } from '~/utils/db.server';
import {
  renderAdminApprovalEmailBody,
  renderCongratulationsEmailBody,
  renderReleaseEmailBody,
} from './email-copy.server';
import { mintSignedLink, RELEASE_LINK_TTL_MS } from './signed-link.server';

export interface ReleaseEmailPayload {
  applicationId: string;
  email: string;
  name: string;
  schoolName: string;
  label?: string;
}

async function logEmail(args: {
  applicationId: string;
  kind: string;
  toEmail: string;
  success: boolean;
  error?: string;
}) {
  try {
    await prisma.freeTierEmailLog.create({
      data: {
        applicationId: args.applicationId,
        kind: args.kind,
        toEmail: args.toEmail,
        success: args.success,
        error: args.error ?? null,
      },
    });
  } catch {
    // logging must not break the flow
  }
}

export async function sendFreeTierReleaseEmail(payload: ReleaseEmailPayload): Promise<void> {
  const base = publicAppOrigin();
  let joinUrl = `${base}/free/join`;
  try {
    const minted = await mintSignedLink({
      applicationId: payload.applicationId,
      purpose: 'RELEASE',
      ttlMs: RELEASE_LINK_TTL_MS,
    });
    joinUrl = `${base}/free/join?t=${encodeURIComponent(minted.token)}`;
    await sendEmail({
      to: payload.email,
      subject: "You're in — start your YAWP classroom",
      html: `<p>${renderReleaseEmailBody({ name: payload.name, joinUrl }).replace(/\n/g, '<br/>')}</p>`,
      text: renderReleaseEmailBody({ name: payload.name, joinUrl }),
    });
    await logEmail({
      applicationId: payload.applicationId,
      kind: 'release',
      toEmail: payload.email,
      success: true,
    });
  } catch (error) {
    await logEmail({
      applicationId: payload.applicationId,
      kind: 'release',
      toEmail: payload.email,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function sendFreeTierAdminApprovalEmail(args: {
  applicationId: string;
  to: string;
  teacherName: string;
  schoolName: string;
  personalNote?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
}) {
  const text = renderAdminApprovalEmailBody({
    teacherName: args.teacherName,
    schoolName: args.schoolName,
    personalNote: args.personalNote,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
  });
  try {
    await sendEmail({
      to: args.to,
      subject: `Approve YAWP for ${args.schoolName}`,
      html: `<pre style="font-family: sans-serif; white-space: pre-wrap">${text}</pre>`,
      text,
    });
    await logEmail({ applicationId: args.applicationId, kind: 'admin_approval', toEmail: args.to, success: true });
  } catch (error) {
    await logEmail({
      applicationId: args.applicationId,
      kind: 'admin_approval',
      toEmail: args.to,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function sendFreeTierCongratulationsEmail(args: {
  applicationId: string;
  teacherEmail: string;
  teacherName: string;
  adminName: string;
  signInUrl: string;
}) {
  const text = renderCongratulationsEmailBody({
    teacherName: args.teacherName,
    adminName: args.adminName,
    signInUrl: args.signInUrl,
  });
  try {
    await sendEmail({
      to: args.teacherEmail,
      subject: `${args.adminName} approved YAWP for your classroom`,
      html: `<p>${text.replace(/\n/g, '<br/>')}</p>`,
      text,
    });
    await logEmail({
      applicationId: args.applicationId,
      kind: 'congratulations',
      toEmail: args.teacherEmail,
      success: true,
    });
  } catch (error) {
    await logEmail({
      applicationId: args.applicationId,
      kind: 'congratulations',
      toEmail: args.teacherEmail,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function sendFreeTierAdminReminderEmail(args: {
  applicationId: string;
  to: string;
  teacherName: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
}) {
  return sendFreeTierAdminApprovalEmail({
    applicationId: args.applicationId,
    to: args.to,
    teacherName: args.teacherName,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
  });
}
