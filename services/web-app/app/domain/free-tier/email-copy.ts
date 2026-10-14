export const ADMIN_APPROVAL_EMAIL_COPY_VERSION = '2026-10-14-v5';

const APPROVAL_LINK_DAYS = 14;

function copyVersionLine(_version: string) {
  return '';
}

function adminApprovalGreeting(adminRecipientName?: string | null) {
  const trimmed = adminRecipientName?.trim();
  if (trimmed) return `Hi ${trimmed},`;
  return 'Hi there,';
}

export function renderAdminApprovalEmailBody(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  /** Accepted for older callers, but never included in approval copy. */
  personalNote?: string | null;
  approveUrl: string;
  notRightPersonUrl: string;
  adminRecipientName?: string | null;
  reminderLead?: string | null;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  const reminder = args.reminderLead?.trim()
    ? `${args.reminderLead.trim()}\n\n`
    : '';
  const greeting = adminApprovalGreeting(args.adminRecipientName);
  return `${reminder}${greeting}

${args.teacherName} (${args.teacherEmail}) at ${args.schoolName} would like to use YAWP in their classroom.

YAWP helps students draft essays with AI-assisted feedback. Teachers stay in control of assignments and grading. Student writing is not used to train public AI models.

Approve YAWP for this school (link expires in ${APPROVAL_LINK_DAYS} days):
${args.approveUrl}

I'm not the right person to approve this:
${args.notRightPersonUrl}

Questions? Contact support@yawp.school.${copyVersionLine(version)}`;
}

export function renderReleaseEmailBody(args: {
  name: string;
  joinUrl: string;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  return `Hi ${args.name},

You're in — we'd love to have you try YAWP with your students.

Create your teacher account to get started:
${args.joinUrl}

This link is for you only and expires in 30 days.

— The YAWP team${copyVersionLine(version)}`;
}

export function renderCongratulationsEmailBody(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  return `Hi ${args.teacherName},

Great news — ${args.adminName} approved YAWP for your classroom.

Sign in to open your class and assign your Class Starter:
${args.signInUrl}

— The YAWP team${copyVersionLine(version)}`;
}
