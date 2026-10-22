import { renderAdminApprovalEmailPlainText } from './admin-approval-copy';

export const ADMIN_APPROVAL_EMAIL_COPY_VERSION = '2026-10-21-admin-v1';

/** Matches the Privacy Policy model-training statement (single sentence). */
export const FREE_TIER_MODEL_TRAINING_LINE =
  'Student writing is never used to train models.';
// Pass the version stored with the application when admission was requested.
// Do not derive delayed email wording from the flag at delivery time.
export const RELEASE_EMAIL_V2_COPY_VERSION = 'free-tier-onboarding-v2';

export function renderReleaseEmailSubject(_args: { copyVersion?: string } = {}) {
  // Bryant and Brian (10/19): one subject for every release email.
  return "You're in — start your Yawp! classroom!";
}

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
  forwardedByAdminName?: string | null;
  copyVersion?: string;
  reminder?: boolean;
}) {
  return renderAdminApprovalEmailPlainText({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    reminder: args.reminder ?? !!args.reminderLead?.trim(),
  });
}

export function renderReleaseEmailBody(args: {
  name: string;
  joinUrl: string;
  copyVersion?: string;
}) {
  const version = args.copyVersion ?? ADMIN_APPROVAL_EMAIL_COPY_VERSION;
  if (version === RELEASE_EMAIL_V2_COPY_VERSION)
    return renderReleaseEmailV2Body({ name: args.name, joinUrl: args.joinUrl });
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

// ---------------------------------------------------------------------------
// Onboarding v2 email copy (Brian's 10/18 free-tier copy doc).
// Used only for applications whose stored copy version is
// RELEASE_EMAIL_V2_COPY_VERSION, so legacy applications keep their wording.
// Existing decisions win over the doc: reminders stay capped at three sends,
// "site license" wording, and no "AI" in user-facing copy.
// ---------------------------------------------------------------------------

const BRIAN_SIGNATURE = `Best always,

Brian Connell
Founder, Yawp! Writing Program`;

export function isOnboardingV2CopyVersion(copyVersion?: string | null) {
  return copyVersion === RELEASE_EMAIL_V2_COPY_VERSION;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim() || 'there';
}

export const RELEASE_EMAIL_V2_SUBJECT = "You're in — start your Yawp! classroom!";

export function renderReleaseEmailV2Body(args: { name: string; joinUrl: string }) {
  return `Hi ${firstName(args.name)},

Good news: your spot is ready. Your free Yawp! classroom license covers one class of up to 35 students, with no cost to you or your school.

Getting started takes about five minutes. You'll set up your class, then ask your administrator to approve it. While you wait, you can explore everything.

Get started:
${args.joinUrl}

This link is for you only and expires in 30 days.

Changed your mind? That's okay. Reply to this email and let us know, and we'll pass your spot to another teacher.

${BRIAN_SIGNATURE}`;
}

export const TEACHER_REMINDER_V2_SUBJECT =
  'Your Yawp! classroom is still waiting on approval';

export function renderTeacherReminderV2Body(args: {
  teacherName: string;
  adminName: string;
  pendingUrl: string;
}) {
  return `Hi ${firstName(args.teacherName)},

We haven't heard from ${args.adminName} yet, so we've sent them a friendly reminder. If it feels right, a quick word in the hallway or a short email from you can help it rise to the top of their inbox.

In the meantime, your classroom preview is ready for you to explore.

Explore my classroom:
${args.pendingUrl}

Think another administrator might be able to approve sooner? You can send your request to someone else.

Request approval from a different administrator:
${args.pendingUrl}

${BRIAN_SIGNATURE}`;
}

export const FORWARD_NOTICE_V2_SUBJECT = 'Your Yawp! approval request was forwarded';

export function renderForwardNoticeV2Body(args: {
  teacherName: string;
  adminName: string;
  adminEmail: string;
  manualReview: boolean;
  pendingUrl: string;
}) {
  return `Hi ${firstName(args.teacherName)},

Your approval request is now with ${args.adminName} (${args.adminEmail}). ${args.manualReview ? 'Our team is reviewing the new request.' : "We'll let you know the moment they approve."}

View your request:
${args.pendingUrl}

${BRIAN_SIGNATURE}`;
}

export const CONGRATULATIONS_V2_SUBJECT =
  'You\'re approved! Your Yawp! classroom is ready';

export function renderCongratulationsEmailV2Body(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
}) {
  return `Hi ${firstName(args.teacherName)},

Good news: ${args.adminName} approved your classroom! All free features are now unlocked. Your next step is to add your students to your class. It takes about five minutes with your students in the room.

Add students:
${args.signInUrl}

It might be worth a quick thank-you to ${args.adminName}, too.

Best always,

Brian`;
}

/** Recover signed admin links from rendered approval email bodies for QA logs. */
export { adminApprovalUrlsFromDesignedEmailBody as adminApprovalUrlsFromEmailBody } from './admin-approval-copy';
