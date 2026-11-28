/** Stop reasons that mean the administrator never got the approval email. */
export const ADMIN_EMAIL_BOUNCED_STOP = 'admin_email_bounced';
export const ADMIN_EMAIL_FAILED_STOP = 'admin_email_failed';

export function isAdminEmailUndeliverableStop(
  stopReason: string | null | undefined
) {
  return (
    stopReason === ADMIN_EMAIL_BOUNCED_STOP ||
    stopReason === ADMIN_EMAIL_FAILED_STOP
  );
}

export function teacherAdminEmailUndeliverableSubject() {
  return "We couldn't reach your administrator";
}

export function teacherAdminEmailUndeliverableBody(args: {
  teacherName: string;
  adminName: string;
  adminEmail: string;
  schoolName: string;
  pendingUrl: string;
}) {
  const first = args.teacherName.trim().split(/\s+/)[0] || 'there';
  return [
    `Hi ${first},`,
    '',
    `The approval email to ${args.adminName} (${args.adminEmail}) didn't go through, so your request is still waiting.`,
    '',
    `Re-enter their email or pick another administrator at ${args.schoolName}.`,
    '',
    `Update your administrator: ${args.pendingUrl}`,
  ].join('\n');
}

export function teacherPendingUndeliverableBody(adminName: string) {
  return `The email to ${adminName} didn't go through. Re-enter their address or pick another administrator.`;
}

export function teamAdminEmailUndeliverableSubject(schoolName: string) {
  return `Free tier: administrator approval email didn't go through (${schoolName})`;
}

export function teamAdminEmailUndeliverableBody(args: {
  teacherName: string;
  teacherEmail: string;
  schoolName: string;
  adminName: string;
  adminEmail: string;
  applicationId: string;
  reason: 'bounced' | 'failed';
  reviewUrl: string | null;
}) {
  const what =
    args.reason === 'bounced'
      ? 'The provider accepted the message, then reported a bounce.'
      : 'The provider rejected the message.';
  return [
    "A free-tier administrator approval email didn't go through.",
    '',
    `Teacher: ${args.teacherName}`,
    `Teacher email: ${args.teacherEmail}`,
    `School: ${args.schoolName}`,
    `Administrator: ${args.adminName}`,
    `Administrator email: ${args.adminEmail}`,
    '',
    what,
    'The teacher was asked to re-enter that address or pick another administrator. The request is marked for follow-up so it does not sit quietly.',
    '',
    `Application ID: ${args.applicationId}`,
    '',
    args.reviewUrl
      ? `Internal review queue:\n${args.reviewUrl}`
      : 'Internal review queue: set INTERNAL_PLATFORM_ORIGIN to include the link.',
  ].join('\n');
}

/** A suppression-list row explains this send when the bounce landed after it. */
export function suppressionMatchesSend(args: {
  reason: string | undefined;
  lastUpdateTime: Date | undefined;
  sentAt: Date;
}) {
  if (args.reason !== 'BOUNCE' && args.reason !== 'COMPLAINT') return false;
  if (!args.lastUpdateTime) return false;
  return +args.lastUpdateTime >= +args.sentAt - 60_000;
}
