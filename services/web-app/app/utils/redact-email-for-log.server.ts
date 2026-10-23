/** Redact an email address for server logs (e.g. `alice@domain.com` → `a***@d***`). */
export function redactEmailForLog(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0 || at >= trimmed.length - 1) {
    return '[redacted-email]';
  }

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const domainLabel = domain.split('.')[0] ?? '';
  if (!local || !domainLabel) {
    return '[redacted-email]';
  }

  return `${local[0]}***@${domainLabel[0]}***`;
}
