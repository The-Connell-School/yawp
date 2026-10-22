/** Admin approval email + school-admin pages (2026-10-21 design). */

import {
  plainTextButton,
  plainTextEmailFooter,
} from '~/emails/plain-text-footer';
import { transactionalEmailPublicOrigin } from '~/emails/public-origin.server';

export const ADMIN_APPROVAL_LINK_DAYS = 14;

export const FREE_TIER_ADMIN_MODEL_TRAINING_LINE =
  'Student writing is never used to train outside models.';

export function teacherAtSchool(teacherName: string, schoolName: string) {
  return `${teacherName} at ${schoolName}`;
}

export function renderAdminApprovalEmailSubject(args: {
  teacherName: string;
  schoolName: string;
  reminder?: boolean;
  forwardedByAdminName?: string | null;
}) {
  const initial = `${teacherAtSchool(args.teacherName, args.schoolName)} would like to use Yawp!`;
  const forwardRecipient = `Can you approve Yawp! for ${teacherAtSchool(args.teacherName, args.schoolName)}?`;
  const core = args.forwardedByAdminName?.trim()
    ? forwardRecipient
    : initial;
  return args.reminder ? `Reminder: ${core}` : core;
}

export function adminApprovalFooterWhy(args: {
  teacherName: string;
  schoolName: string;
  forwardedByAdminName?: string | null;
}) {
  const forwarder = args.forwardedByAdminName?.trim();
  if (forwarder) {
    return `You're getting this because ${forwarder} forwarded ${args.teacherName}'s request to you.`;
  }
  return `You're getting this because ${args.teacherName} named you as an administrator who can approve classroom software at ${args.schoolName}.`;
}

export function renderAdminApprovalEmailPlainText(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
  forwardedByAdminName?: string | null;
  reminder?: boolean;
}) {
  const origin = transactionalEmailPublicOrigin();
  const teacherSchool = teacherAtSchool(args.teacherName, args.schoolName);
  const forwarder = args.forwardedByAdminName?.trim();
  const forwardLead = forwarder
    ? `${forwarder} forwarded this to you as the right person to approve classroom software for ${teacherSchool}.\n\n`
    : '';
  const reminderLead = args.reminder
    ? `This is a reminder about the approval request below.\n\n`
    : '';
  const classroomIntro = `${teacherSchool} would like to use Yawp! in their classroom.`;
  const administratorIntro = forwarder
    ? ''
    : ' They named you as the administrator who can approve classroom software.';
  return `${reminderLead}${forwardLead}Approve Yawp! for ${teacherSchool}

${classroomIntro}${administratorIntro}

Teacher: ${args.teacherName}
School: ${args.schoolName}
Email: ${args.teacherEmail}

About Yawp!
Students draft essays with feedback as they write.
Teachers control assignments and grading.
${FREE_TIER_ADMIN_MODEL_TRAINING_LINE}

${plainTextButton('Review and approve', args.approveUrl)}

Not the right person? Forward this request:
${args.notRightPersonUrl}

This link works for ${ADMIN_APPROVAL_LINK_DAYS} days. You don't need a Yawp! account.

${plainTextEmailFooter(
  adminApprovalFooterWhy({
    teacherName: args.teacherName,
    schoolName: args.schoolName,
    forwardedByAdminName: args.forwardedByAdminName,
  }),
  origin
)}`;
}

function firstAdminLinkInText(text: string, path: '/free/admin/approve' | '/free/admin/not-right-person') {
  const re = new RegExp(
    `(https?:\\/\\/[^\\s]+${path.replace(/\//g, '\\/')}[^\\s]*)`
  );
  return re.exec(text)?.[1];
}

export function adminApprovalUrlsFromDesignedEmailBody(text: string): {
  approveUrl?: string;
  notRightPersonUrl?: string;
} {
  const lines = text.split('\n').map((line) => line.trim());
  const approveHeading = lines.findIndex((line) => line === 'Review and approve:');
  const forwardHeading = lines.findIndex(
    (line) => line === 'Not the right person? Forward this request:'
  );
  const approveFromDesigned =
    approveHeading >= 0 ? lines[approveHeading + 1] : undefined;
  const forwardFromDesigned =
    forwardHeading >= 0 ? lines[forwardHeading + 1] : undefined;
  const approveV2Heading = lines.findIndex((line) =>
    /^Approve .+'s free classroom \(link expires in \d+ days\):$/.test(line)
  );
  const forwardV2Heading = lines.findIndex(
    (line) => line === "I'm not the right person to approve this:"
  );
  const approveUrl =
    approveFromDesigned?.startsWith('http')
      ? approveFromDesigned
      : approveV2Heading >= 0
        ? lines[approveV2Heading + 1]
        : firstAdminLinkInText(text, '/free/admin/approve');
  const notRightPersonUrl =
    forwardFromDesigned?.startsWith('http')
      ? forwardFromDesigned
      : forwardV2Heading >= 0
        ? lines[forwardV2Heading + 1]
        : firstAdminLinkInText(text, '/free/admin/not-right-person');
  return {
    ...(approveUrl?.startsWith('http') ? { approveUrl } : {}),
    ...(notRightPersonUrl?.startsWith('http') ? { notRightPersonUrl } : {}),
  };
}

export function approvePageTitle(teacherName: string, schoolName: string) {
  return `Approve Yawp! for ${teacherAtSchool(teacherName, schoolName)}`;
}

export function approvePageIntro(teacherName: string, schoolName: string) {
  return `${teacherAtSchool(teacherName, schoolName)} would like to use Yawp! in their classroom. They named you as the administrator who can approve classroom software.`;
}

export function approveCheckboxLabel(teacherName: string, schoolName: string) {
  return `I can approve classroom software for ${teacherAtSchool(teacherName, schoolName)}.`;
}

export function approveValidationSummary(errorCount: number) {
  if (errorCount === 1) {
    return 'One thing needs your attention before you can approve.';
  }
  return 'Two things need your attention before you can approve.';
}

export function approveCheckboxError(teacherName: string, schoolName: string) {
  return `Confirm you can approve classroom software for ${teacherAtSchool(teacherName, schoolName)}.`;
}

export function thankYouBody(teacherName: string, schoolName: string) {
  return `${teacherAtSchool(teacherName, schoolName)} can start using Yawp! We let them know.`;
}

export function alreadyApprovedBody(teacherName: string, schoolName: string) {
  return `Yawp! is already approved for ${teacherAtSchool(teacherName, schoolName)}. There's nothing else to do.`;
}

export function declinedBody(teacherName: string, schoolName: string) {
  return `Yawp! did not approve the request from ${teacherAtSchool(teacherName, schoolName)}. Questions? Email support@yawp.school.`;
}

export function linkExpiredBody(teacherName: string, schoolName: string) {
  return `It was for ${teacherAtSchool(teacherName, schoolName)}. Ask ${teacherName.split(/\s+/)[0] ?? teacherName} to send a new request, or email support@yawp.school.`;
}

export const linkInvalidBody =
  'It may be incomplete. Copy it again from the email, or email support@yawp.school.';

export function linkReplacedBody(teacherName: string, schoolName: string) {
  return `The request for ${teacherAtSchool(teacherName, schoolName)} was forwarded to someone else, so this link no longer works. Questions? Email support@yawp.school.`;
}

export function forwardPageTitle() {
  return 'Send this to the right person';
}

export function forwardPageIntro(teacherName: string, schoolName: string) {
  return `Who approves classroom software for ${teacherAtSchool(teacherName, schoolName)}? A site or district administrator.`;
}

export function forwardValidationSummary(errorCount: number) {
  if (errorCount === 1) {
    return 'One thing needs your attention before you can forward this.';
  }
  return 'Two things need your attention before you can forward this.';
}

export function forwardSentBody(args: {
  teacherName: string;
  schoolName: string;
  recipientName: string;
  recipientEmail: string;
}) {
  return `We sent the request for ${teacherAtSchool(args.teacherName, args.schoolName)} to ${args.recipientName} (${args.recipientEmail}). You're all set.`;
}
