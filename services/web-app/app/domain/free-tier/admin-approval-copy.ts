/** Admin approval email + school-admin pages (2026-10-21 design, pass1 2026-10-23). */

import {
  defaultTransactionalEmailOrigin,
  plainTextButton,
  plainTextEmailFooter,
} from '~/emails/plain-text-footer';

export const ADMIN_APPROVAL_LINK_DAYS = 14;

export const FREE_TIER_SUPPORT_EMAIL = 'support@yawp.school';

export const FREE_TIER_ADMIN_MODEL_TRAINING_LINE =
  'Student writing is never used to train outside models.';

export function teacherAtSchool(teacherName: string, schoolName: string) {
  return `${teacherName} at ${schoolName}`;
}

export function teacherFirstName(teacherName: string) {
  return teacherName.trim().split(/\s+/)[0] || teacherName.trim() || 'there';
}

const ADMIN_APPROVAL_TEACHER_REROUTE_LEAD_MARKER_LEGACY =
  'asked us to send this to you as the right person to approve classroom software for';

const ADMIN_APPROVAL_TEACHER_REROUTE_LEAD_MARKER_PASS1 =
  'asked you to approve classroom software for their class at';

export function adminApprovalTeacherRerouteLeadMarker(pass1 = false) {
  return pass1
    ? ADMIN_APPROVAL_TEACHER_REROUTE_LEAD_MARKER_PASS1
    : ADMIN_APPROVAL_TEACHER_REROUTE_LEAD_MARKER_LEGACY;
}

/** Pass1 frames E2f / E3 — admin forward recipient banner (flag on only). */
export function adminApprovalPass1ForwardBanner(
  forwarderName: string,
  teacherName: string,
  schoolName: string
) {
  return `${forwarderName} forwarded ${teacherName}'s request at ${schoolName} to you.`;
}

export function adminApprovalTeacherRerouteLead(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  if (pass1) {
    return `${teacherName} asked you to approve classroom software for their class at ${schoolName}.`;
  }
  const teacherSchool = teacherAtSchool(teacherName, schoolName);
  return `${teacherName} ${ADMIN_APPROVAL_TEACHER_REROUTE_LEAD_MARKER_LEGACY} ${teacherSchool}.`;
}

export function adminApprovalTeacherRerouteFooterWhy(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  if (pass1) {
    return `You're getting this because ${teacherName} named you as an administrator at ${schoolName}.`;
  }
  return `You're getting this because ${teacherName} asked us to send their approval request to you.`;
}

export function adminApprovalEmailPreheader(args: {
  teacherName: string;
  schoolName: string;
  reminder?: boolean;
  forwardedByAdminName?: string | null;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  const forwarder = args.forwardedByAdminName?.trim();
  if (args.reminder) {
    return pass1
      ? `${args.teacherName}'s request for ${args.schoolName} is still open. It takes a couple of minutes.`
      : `${args.teacherName}'s request is still open. It takes a couple of minutes.`;
  }
  if (forwarder) {
    return pass1
      ? `${forwarder} forwarded ${args.teacherName}'s request at ${args.schoolName} to you.`
      : `${forwarder} forwarded this to you. No Yawp! account needed.`;
  }
  return pass1
    ? `${teacherAtSchool(args.teacherName, args.schoolName)} needs your OK. It takes a couple of minutes, and no Yawp! account is needed.`
    : "Review the request in a couple of minutes. You don't need a Yawp! account.";
}

export function renderAdminApprovalEmailSubject(args: {
  teacherName: string;
  schoolName: string;
  reminder?: boolean;
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
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
  routedByTeacher?: boolean;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  if (args.routedByTeacher && pass1) {
    return adminApprovalTeacherRerouteFooterWhy(
      args.teacherName,
      args.schoolName,
      pass1
    );
  }
  const forwarder = args.forwardedByAdminName?.trim();
  if (forwarder) {
    return pass1
      ? `You're getting this because ${forwarder} forwarded ${args.teacherName}'s request at ${args.schoolName} to you.`
      : `You're getting this because ${forwarder} forwarded ${args.teacherName}'s request to you.`;
  }
  if (pass1) {
    return `You're getting this because ${args.teacherName} named you as the administrator who can approve classroom software at ${args.schoolName}.`;
  }
  return `You're getting this because ${args.teacherName} named you as an administrator who can approve classroom software at ${args.schoolName}.`;
}

/** Muted reminder line above the approval headline (pass1 frames E2 / E2f). */
export function adminApprovalReminderMutedLead(args: {
  teacherName: string;
  schoolName: string;
  forwardedByAdminName?: string | null;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  if (!pass1) {
    return 'This is a reminder about the approval request below.';
  }
  const forwarder = args.forwardedByAdminName?.trim();
  if (forwarder) {
    return `A quick reminder: ${forwarder} forwarded ${args.teacherName}'s request at ${args.schoolName} to you, and it's still waiting on your approval.`;
  }
  return `A quick reminder: ${teacherAtSchool(args.teacherName, args.schoolName)} is still waiting on your approval.`;
}

export function renderAdminApprovalEmailPlainText(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  approveUrl: string;
  notRightPersonUrl: string;
  forwardedByAdminName?: string | null;
  routedByTeacher?: boolean;
  reminder?: boolean;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  const origin = defaultTransactionalEmailOrigin();
  const teacherSchool = teacherAtSchool(args.teacherName, args.schoolName);
  const forwarder = args.forwardedByAdminName?.trim();
  const skipForwardLeadForPass1Reminder =
    pass1 && args.reminder && Boolean(forwarder) && !args.routedByTeacher;
  const forwardLead =
    skipForwardLeadForPass1Reminder
      ? ''
      : args.routedByTeacher && pass1
        ? `${adminApprovalTeacherRerouteLead(args.teacherName, args.schoolName, true)}\n\n`
        : forwarder
          ? pass1
            ? `${adminApprovalPass1ForwardBanner(forwarder, args.teacherName, args.schoolName)}\n\n`
            : `${forwarder} forwarded this to you as the right person to approve classroom software for ${teacherSchool}.\n\n`
          : '';
  const reminderLead = args.reminder
    ? `${adminApprovalReminderMutedLead({
        teacherName: args.teacherName,
        schoolName: args.schoolName,
        forwardedByAdminName: args.forwardedByAdminName,
        pass1,
      })}\n\n`
    : '';
  const classroomIntro = `${teacherSchool} would like to use Yawp! in their classroom.`;
  const administratorIntro =
    pass1 || forwarder || (args.routedByTeacher && pass1)
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
    routedByTeacher: args.routedByTeacher && pass1,
    pass1,
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
  return `${teacherAtSchool(teacherName, schoolName)} can start using Yawp! We've let ${teacherFirstName(teacherName)} know.`;
}

export function thankYouTeacherEmailFailedBody(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  const first = teacherFirstName(teacherName);
  if (pass1) {
    return `${teacherAtSchool(teacherName, schoolName)} can start using Yawp! We couldn't email ${first} just now, so our team will let them know.`;
  }
  return `${teacherAtSchool(teacherName, schoolName)} can start using Yawp! We could not send your confirmation email.`;
}

export function freeClassroomsPausedBody(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  if (pass1) {
    return `We couldn't approve Yawp! for ${teacherAtSchool(teacherName, schoolName)} right now because new free classrooms are paused. Your link still works, and our team will follow up.`;
  }
  return `Yawp! has reached the current free-tier budget for this environment. We did not use this approval link; our team will follow up.`;
}

export function alreadyApprovedBody(teacherName: string, schoolName: string) {
  return `Yawp! is already approved for ${teacherAtSchool(teacherName, schoolName)}. There's nothing else to do.`;
}

export function declinedBody(teacherName: string, schoolName: string) {
  return `Yawp! did not approve the request from ${teacherAtSchool(teacherName, schoolName)}. Questions? Email ${FREE_TIER_SUPPORT_EMAIL}.`;
}

export function linkExpiredBody(teacherName: string, schoolName: string) {
  return `It was for ${teacherAtSchool(teacherName, schoolName)}. Ask ${teacherFirstName(teacherName)} to send a new request, or email ${FREE_TIER_SUPPORT_EMAIL}.`;
}

export const linkInvalidBodyGeneric =
  'It may be incomplete. Copy it again from the email, or email support@yawp.school.';

export function linkInvalidKnownRequestLine(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  if (!pass1) return '';
  return `This link was for ${teacherAtSchool(teacherName, schoolName)}.`;
}

export function linkInvalidBodyForRequest(args: {
  teacherName?: string;
  schoolName?: string;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  const known =
    args.teacherName && args.schoolName
      ? linkInvalidKnownRequestLine(
          args.teacherName,
          args.schoolName,
          pass1
        )
      : '';
  if (known) {
    return `${known} ${linkInvalidBodyGeneric}`;
  }
  return linkInvalidBodyGeneric;
}

export type AdminLinkReplacedVariant = 'forwarded' | 'resent';

export function linkReplacedBody(
  teacherName: string,
  schoolName: string,
  variant: AdminLinkReplacedVariant = 'forwarded',
  pass1 = false
) {
  const teacherSchool = teacherAtSchool(teacherName, schoolName);
  if (pass1 && variant === 'resent') {
    return `A newer link was sent for ${teacherSchool}. Use the most recent email, or email ${FREE_TIER_SUPPORT_EMAIL}.`;
  }
  return `The request for ${teacherSchool} was forwarded to someone else, so this link no longer works. Questions? Email ${FREE_TIER_SUPPORT_EMAIL}.`;
}

export function forwardPageTitle(teacherName: string, pass1 = false) {
  if (pass1) {
    return `Who should approve Yawp! for ${teacherName}?`;
  }
  return 'Send this to the right person';
}

export function forwardPageIntro(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  if (pass1) {
    return `Who approves classroom software at ${schoolName}? Usually a site or district administrator.`;
  }
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
  manualReview?: boolean;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  const teacherSchool = teacherAtSchool(args.teacherName, args.schoolName);
  const recipient = `${args.recipientName} (${args.recipientEmail})`;
  if (pass1 && args.manualReview) {
    return `We'll send the request for ${teacherSchool} to ${recipient} shortly. You're all set.`;
  }
  return `We sent the request for ${teacherSchool} to ${recipient}. You're all set.`;
}

export function forwardInlineAlert(args: {
  reason:
    | 'same_administrator'
    | 'chain_cap'
    | 'email_failed'
    | 'same_as_teacher';
  teacherName: string;
  schoolName: string;
  adminName?: string;
  pass1?: boolean;
}) {
  const pass1 = args.pass1 ?? false;
  const teacherSchool = teacherAtSchool(args.teacherName, args.schoolName);
  switch (args.reason) {
    case 'same_administrator':
      if (pass1 && args.adminName?.trim()) {
        return `${args.adminName.trim()} already has this request. Choose a different administrator at ${args.schoolName}.`;
      }
      return 'Choose a different administrator to forward this request.';
    case 'chain_cap':
      return pass1
        ? `The request for ${teacherSchool} has been forwarded too many times. Email ${FREE_TIER_SUPPORT_EMAIL} and we'll sort it out.`
        : `This request was forwarded too many times. Email ${FREE_TIER_SUPPORT_EMAIL} and we will sort it out.`;
    case 'email_failed':
      return pass1
        ? `We couldn't send the request for ${args.teacherName}. Try again.`
        : "We couldn't send the email. Try again.";
    case 'same_as_teacher':
      return pass1
        ? `That's ${teacherFirstName(args.teacherName)}'s own email. Enter the administrator who approves classroom software at ${args.schoolName}.`
        : "That's the teacher's own email. Enter the administrator who approves classroom software.";
    default:
      return '';
  }
}

export function unableToForwardBody(
  teacherName: string,
  schoolName: string,
  pass1 = false
) {
  if (pass1) {
    return `We couldn't forward the request for ${teacherAtSchool(teacherName, schoolName)}. Reload the page or email ${FREE_TIER_SUPPORT_EMAIL}.`;
  }
  return 'We could not forward this request. Reload the page or contact support@yawp.school.';
}

export function forwardRateLimitedBody() {
  return 'Please wait a few minutes before trying again.';
}

/** Teacher pending page forward errors (app.free-tier.pending). */
export function teacherPendingForwardError(args: {
  reason:
    | 'same_administrator'
    | 'chain_cap'
    | 'email_failed'
    | 'same_as_teacher';
  schoolName: string;
  adminName?: string;
}) {
  switch (args.reason) {
    case 'same_as_teacher':
      return `That's your own email. Enter the administrator who approves classroom software at ${args.schoolName}.`;
    case 'same_administrator':
      if (args.adminName?.trim()) {
        return `${args.adminName.trim()} already has your request. Choose a different administrator at ${args.schoolName}.`;
      }
      return `They already have your request. Choose a different administrator at ${args.schoolName}.`;
    case 'chain_cap':
      return `Your request has been forwarded too many times. Email ${FREE_TIER_SUPPORT_EMAIL} and we'll sort it out.`;
    case 'email_failed':
      return "We couldn't send your request. Try again.";
    default:
      return '';
  }
}
