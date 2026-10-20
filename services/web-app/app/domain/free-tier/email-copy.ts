export const ADMIN_APPROVAL_EMAIL_COPY_VERSION = '2026-10-14-v5';

/** Matches the Privacy Policy model-training statement (single sentence). */
export const FREE_TIER_MODEL_TRAINING_LINE =
  'Student writing is never used to train models.';
// Pass the version stored with the application when admission was requested.
// Do not derive delayed email wording from the flag at delivery time.
export const RELEASE_EMAIL_V2_COPY_VERSION = 'free-tier-onboarding-v2';

export function renderReleaseEmailSubject(args: { copyVersion?: string } = {}) {
  return args.copyVersion === RELEASE_EMAIL_V2_COPY_VERSION
    ? "You're in!"
    : "You're in — start your Yawp! classroom";
}

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

${args.teacherName} (${args.teacherEmail}) at ${args.schoolName} would like to use Yawp! in their classroom.

Yawp! helps students draft essays with feedback while teachers stay in control of assignments and grading. ${FREE_TIER_MODEL_TRAINING_LINE}

Approve Yawp! for this school (link expires in ${APPROVAL_LINK_DAYS} days):
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
  const welcome = version === RELEASE_EMAIL_V2_COPY_VERSION
    ? "You're in!\n\nWe'd love to have you try Yawp! with your students."
    : "You're in — we'd love to have you try Yawp! with your students.";
  return `Hi ${args.name},

${welcome}

Create your teacher account to get started:
${args.joinUrl}

This link is for you only and expires in 30 days.

— The Yawp! team${copyVersionLine(version)}`;
}

export function renderCongratulationsEmailBody(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  return `Hi ${args.teacherName},

Great news — ${args.adminName} approved Yawp! for your classroom.

Sign in to open your class and assign your Class Starter:
${args.signInUrl}

— The Yawp! team${copyVersionLine(version)}`;
}
