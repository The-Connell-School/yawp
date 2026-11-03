import { renderAdminApprovalEmailPlainText } from './admin-approval-copy';
import {
  plainTextButton,
  plainTextEmailFooter,
} from '~/emails/plain-text-footer';
import { defaultTransactionalEmailOrigin } from '~/emails/plain-text-footer';

export const ADMIN_APPROVAL_EMAIL_COPY_VERSION = '2026-10-21-admin-v1';
export const ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1 =
  '2026-10-23-admin-pass1';
// Pass the version stored with the application when admission was requested.
// Do not derive delayed email wording from the flag at delivery time.
export const RELEASE_EMAIL_V2_COPY_VERSION = 'free-tier-onboarding-v2';

export function renderReleaseEmailSubject(args: { copyVersion?: string } = {}) {
  if (args.copyVersion === RELEASE_EMAIL_V2_COPY_VERSION) {
    return RELEASE_EMAIL_V2_SUBJECT;
  }
  // Legacy applications keep the historical subject line.
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
  routedByTeacher?: boolean;
  copyVersion?: string;
  reminder?: boolean;
  pass1?: boolean;
}) {
  const pass1 =
    args.pass1 ??
    args.copyVersion === ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1;
  return renderAdminApprovalEmailPlainText({
    teacherName: args.teacherName,
    teacherEmail: args.teacherEmail,
    schoolName: args.schoolName,
    approveUrl: args.approveUrl,
    notRightPersonUrl: args.notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    routedByTeacher: args.routedByTeacher,
    reminder: args.reminder ?? !!args.reminderLead?.trim(),
    pass1,
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

export const RELEASE_EMAIL_V2_SUBJECT =
  "You're in: start your Yawp! classroom";

export function renderReleaseEmailV2Body(args: { name: string; joinUrl: string }) {
  const origin = defaultTransactionalEmailOrigin();
  return `Hi ${firstName(args.name)},

Your spot is ready. Your free Yawp! classroom license covers one class of up to 35 students, at no cost to you or your school.

Setup takes about five minutes: create your class, then ask your administrator to approve it. You can explore everything while you wait.

${plainTextButton('Get started', args.joinUrl)}

This link is just for you and expires in 30 days.

Changed your mind? Just reply and let us know, and we'll pass your spot to another teacher.

${BRIAN_SIGNATURE}

${plainTextEmailFooter(
  "You're getting this because you signed up for a free Yawp! classroom license.",
  origin
)}`;
}

export const TEACHER_REMINDER_V2_SUBJECT =
  'Your Yawp! classroom is still waiting on approval';

export function renderTeacherReminderV2Body(args: {
  teacherName: string;
  adminName: string;
  pendingUrl: string;
  changeAdminUrl?: string;
}) {
  const origin = defaultTransactionalEmailOrigin();
  const changeAdminUrl = args.changeAdminUrl ?? args.pendingUrl;
  return `Hi ${firstName(args.teacherName)},

We haven't heard from ${args.adminName} yet, so we sent a friendly reminder. A quick word in the hallway or a short email from you can help, too.

In the meantime, your classroom preview is ready to explore.

${plainTextButton('Explore my classroom', args.pendingUrl)}

Think another administrator could approve sooner? You can send your request to them instead.

${plainTextButton(
  'Request approval from a different administrator',
  changeAdminUrl
)}

${BRIAN_SIGNATURE}

${plainTextEmailFooter(
  "You're getting this once a week while your classroom waits for approval. It stops as soon as you're approved.",
  origin
)}`;
}

export const FORWARD_NOTICE_V2_SUBJECT = 'Your Yawp! approval request was forwarded';

export function renderForwardNoticeV2Body(args: {
  teacherName: string;
  adminName: string;
  adminEmail: string;
  manualReview: boolean;
  pendingUrl: string;
}) {
  const origin = defaultTransactionalEmailOrigin();
  const followUp = args.manualReview
    ? 'Our team is reviewing the new request.'
    : "We'll let you know the moment they approve.";
  return `Hi ${firstName(args.teacherName)},

Your approval request is now with ${args.adminName} (${args.adminEmail}). ${followUp}

${plainTextButton('View your request', args.pendingUrl)}

${BRIAN_SIGNATURE}

${plainTextEmailFooter(
  "You're getting this because you asked a school administrator to approve your Yawp! classroom.",
  origin
)}`;
}

export const CONGRATULATIONS_V2_SUBJECT =
  'You\'re approved! Your Yawp! classroom is ready';

export function renderCongratulationsEmailV2Body(args: {
  teacherName: string;
  adminName: string;
  signInUrl: string;
}) {
  const origin = defaultTransactionalEmailOrigin();
  return `Hi ${firstName(args.teacherName)},

${args.adminName} approved your classroom, so all free features are now unlocked.

Next, add your students. It takes about five minutes with your class in the room.

${plainTextButton('Add students', args.signInUrl)}

A quick thank-you to ${args.adminName} might be nice, too.

${BRIAN_SIGNATURE}

${plainTextEmailFooter(
  `You're getting this because ${args.adminName} approved your Yawp! classroom.`,
  origin
)}`;
}

/** Recover signed admin links from rendered approval email bodies for QA logs. */
export { adminApprovalUrlsFromDesignedEmailBody as adminApprovalUrlsFromEmailBody } from './admin-approval-copy';
