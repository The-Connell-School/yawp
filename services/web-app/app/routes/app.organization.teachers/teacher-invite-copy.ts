export const TEACHER_INVITE_ALL_FAILED_MESSAGE =
  "We couldn't send your invitations. Check the addresses and try again.";

export const TEACHER_INVITE_SERVER_ERROR_MESSAGE =
  "Something went wrong and we couldn't confirm your invitations. Try again.";

export function teacherInviteSuccessMessage(sentCount: number): string {
  if (sentCount === 1) {
    return 'Invitation sent to 1 teacher.';
  }
  return `Invitations sent to ${sentCount} teachers.`;
}

export function teacherInvitePartialFailureMessage(
  failedEmails: string[]
): string {
  return `We couldn't send to: ${failedEmails.join(', ')}. Try again.`;
}

export function formatFailedTeacherInviteEmailsForTextarea(
  failedEmails: string[]
): string {
  return failedEmails.join(', ');
}

export function nextTeacherInviteEmailsAfterResult({
  currentEmails,
  sentCount,
  failedEmails,
}: {
  currentEmails: string;
  sentCount: number;
  failedEmails: string[];
}): string {
  if (sentCount > 0 && failedEmails.length === 0) {
    return '';
  }
  if (sentCount > 0 && failedEmails.length > 0) {
    return formatFailedTeacherInviteEmailsForTextarea(failedEmails);
  }
  return currentEmails;
}
