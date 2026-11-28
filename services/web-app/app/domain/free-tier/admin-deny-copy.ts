/** Admin deny + teacher-after-deny copy (2026-10-22 design). */

import { teacherAtSchool } from './admin-approval-copy';

export function adminDenyConfirmTitle() {
  return 'Deny this request?';
}

export function adminDenyConfirmBody(teacherName: string, schoolName: string) {
  return `${teacherAtSchool(teacherName, schoolName)} won't get a free classroom from this request. We'll let ${teacherName.split(/\s+/)[0] ?? teacherName} know.`;
}

export function adminDenyReasonHint(teacherName: string) {
  const first = teacherName.split(/\s+/)[0] ?? teacherName;
  return `Only the Yawp! team sees this. ${first} won't.`;
}

export function adminDenySaveError() {
  return "We couldn't save your answer. Try again, or email support@yawp.school.";
}

export function adminDenyThanksTitle() {
  return 'Thanks for letting us know';
}

export function adminDenyThanksBody(teacherName: string, schoolName: string) {
  return `You declined the free classroom request from ${teacherAtSchool(teacherName, schoolName)}.`;
}

export const adminDenyReopenLabel = 'Reopen request';

export function adminDenyReopenError(
  reason: string,
  teacherName: string
): string {
  const first = teacherName.split(/\s+/)[0] ?? teacherName;
  if (reason === 'superseded') {
    return `${first} has already asked another administrator, so this request can't be reopened here.`;
  }
  if (reason === 'closed') {
    return 'This request is already closed, so it can’t be reopened.';
  }
  return "We couldn't reopen the request. Try again, or email support@yawp.school.";
}

export function adminDenyAlreadyAnsweredTitle() {
  return "You've already answered this request.";
}

export function adminDenyAlreadyAnsweredBody(
  teacherName: string,
  schoolName: string,
  decidedAt: Date
) {
  const date = decidedAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `You declined the request from ${teacherAtSchool(teacherName, schoolName)} on ${date}.`;
}

export function teacherDeniedStatusTitle() {
  return "Your request wasn't approved";
}

export function teacherDeniedStatusBody(adminName: string, schoolName: string) {
  return `${adminName} didn't approve Yawp! for your classroom this time. Your class is still here, and you can ask another administrator at ${schoolName}.`;
}

export function teacherAskAnotherHint(used: number, cap: number) {
  const left = Math.max(0, cap - used);
  return `${left} of ${cap} requests left`;
}

export function teacherAllRequestsUsedBody() {
  return "You've used all three administrator requests for this classroom. Email support and we'll help you find a path forward.";
}

/** Brian Connell, 28 Nov 2026. Subject typo "And update" corrected to "An update". */
export const teacherDenyEmailSubject = 'An update on your Yawp! request';

export const teacherDenyEmailPreheader =
  'Your administrator did not approve Yawp! for use in your classroom at this time.';

export const teacherDenyEmailHeadline = teacherDenyEmailSubject;

export function teacherDenyEmailGreeting(teacherName: string) {
  return `Dear ${teacherName.trim() || 'there'},`;
}

export const teacherDenyEmailIntro =
  "Your administrator did not approve Yawp! for use in your classroom at this time. We know that's disappointing, and we'd still love to get you writing with us. Here are a few ways forward:";

export const teacherDenyEmailWays = [
  {
    title: 'Ask a different administrator.',
    body: 'If someone else at your school or district can approve classroom tools, you can send them a new request from your Yawp! account.',
  },
  {
    title: 'Talk with your administrator.',
    body: 'Sometimes a "no" is really a "not yet" or "I have questions." A quick conversation about how you\'d use Yawp! with your students can go a long way.',
  },
  {
    title: 'Bring us in.',
    body: "We're happy to talk with your administrator directly, answer questions about student privacy and how the Tutor works, or give a short demo. Just reply to this email and we'll set it up.",
  },
] as const;

export const teacherDenyEmailClose =
  'We built Yawp! for teachers like you, and we think you and your students would love it. We hope to see you on the platform soon.';

export const teacherDenyEmailSignOff = [
  'Best always,',
  'Brian Connell',
  'The Yawp! Team',
] as const;

export const teacherDenyEmailAskAnotherLabel = 'Ask another administrator';
export const teacherDenyEmailSupportLabel = 'Email support';
export const teacherDenyEmailSupportMailto = 'mailto:support@yawp.school';

export function renderTeacherDenyEmailText(args: {
  teacherName: string;
  statusUrl: string;
  chainCapReached: boolean;
}) {
  const ways = teacherDenyEmailWays
    .map((way) => `- ${way.title} ${way.body}`)
    .join('\n');
  const cta = args.chainCapReached
    ? `${teacherDenyEmailSupportLabel}: support@yawp.school`
    : `${teacherDenyEmailAskAnotherLabel}: ${args.statusUrl}`;
  return [
    teacherDenyEmailGreeting(args.teacherName),
    '',
    teacherDenyEmailIntro,
    '',
    ways,
    '',
    teacherDenyEmailClose,
    '',
    ...teacherDenyEmailSignOff,
    '',
    cta,
  ].join('\n');
}
