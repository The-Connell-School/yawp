/** Client-safe mailbox identity, shared with the approval rules. */
export function mailboxIdentity(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf('@');
  if (at < 0) return normalized;
  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

export function selfAdminEmailError(
  teacherEmail: string,
  adminEmail: string
): string | null {
  return adminEmail.trim() &&
    mailboxIdentity(teacherEmail) === mailboxIdentity(adminEmail)
    ? "Use your administrator's email here, not your own."
    : null;
}
