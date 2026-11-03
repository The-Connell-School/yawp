import { redactEmailForLog } from './redact-email-for-log';

const MAX_SAFE_ERROR_MESSAGE_LENGTH = 300;

const TOKEN_LIKE =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:token|code|secret|password|otp|api[_-]?key)\s*[:=]\s*[^\s,;'"]+)/gi;

/** Redact tokens, emails, and URLs from text shown in UI or written to logs. */
export function redactFreeformMessage(message: string): string {
  let text = message.replace(TOKEN_LIKE, '[redacted-token]');
  // Scoped npm paths (`node_modules/@scope/pkg/file.js:line:col`) must not match as emails.
  text = text.replace(/[^\s@/]+@[^\s@/]+\.[^\s@/]+/g, (email) =>
    redactEmailForLog(email),
  );
  text = text.replace(/https?:\/\/[^\s)]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return '[redacted-url]';
    }
  });
  text = text.replace(/\?[^\s)'"]+/g, '');
  if (text.length > MAX_SAFE_ERROR_MESSAGE_LENGTH) {
    return `${text.slice(0, MAX_SAFE_ERROR_MESSAGE_LENGTH)}…`;
  }
  return text;
}
