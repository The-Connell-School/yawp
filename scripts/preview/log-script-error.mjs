/**
 * Safe script error logging for preview host Node services (.mjs).
 * Mirrors services/web-app/app/utils/log-script-error.server.ts and
 * buildSafeErrorForLog — keep behavior aligned when changing those modules.
 */

const MAX_SAFE_ERROR_MESSAGE_LENGTH = 300;

const TOKEN_LIKE =
  /\b(?:Bearer\s+[A-Za-z0-9._~+/=-]+|(?:token|code|secret|password|otp|api[_-]?key)\s*[:=]\s*[^\s,;'"]+)/gi;

function redactEmailForLog(email) {
  const trimmed = email.trim();
  if (!trimmed || /\s/.test(trimmed)) {
    return '[redacted-email]';
  }
  if (trimmed.indexOf('@') !== trimmed.lastIndexOf('@')) {
    return '[redacted-email]';
  }
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

function redactFreeformMessage(message) {
  let text = message.replace(TOKEN_LIKE, '[redacted-token]');
  text = text.replace(/[^\s@/]+@[^\s@/]+\.[^\s@/]+/g, (email) => redactEmailForLog(email));
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

const REAL_STACK_FRAME = /^\s*at .*:\d+:\d+\)?$/;

function sanitizeStackFrame(line) {
  let out = line.replace(/https?:\/\/[^\s)]+/gi, (url) => {
    try {
      const parsed = new URL(url);
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString();
    } catch {
      return '[redacted-url]';
    }
  });
  out = out.replace(/\?[^:)]+(?=:\d+:\d+)/g, '');
  return out.replace(/\?[^\s)'"]+/g, '');
}

function buildSafeStackForLog(error) {
  if (!(error instanceof Error) || !error.stack) {
    return undefined;
  }
  const frames = error.stack
    .split('\n')
    .slice(1)
    .filter((line) => REAL_STACK_FRAME.test(line))
    .map((line) => redactFreeformMessage(sanitizeStackFrame(line)));
  if (frames.length === 0) {
    return undefined;
  }
  return frames.join('\n');
}

export function buildSafeErrorForLog(error) {
  if (!(error instanceof Error)) {
    return {
      name: 'UnknownError',
      message: redactFreeformMessage(String(error)),
    };
  }

  if (error.name.startsWith('PrismaClient')) {
    const code =
      typeof error.code === 'string'
        ? error.code
        : undefined;
    const stack = buildSafeStackForLog(error);
    return {
      name: error.name,
      ...(code ? { code } : {}),
      ...(stack ? { stack } : {}),
    };
  }

  const stack = buildSafeStackForLog(error);
  const code =
    typeof error.code === 'string' || typeof error.code === 'number'
      ? String(error.code)
      : undefined;
  return {
    name: error.name,
    message: redactFreeformMessage(error.message),
    ...(code ? { code } : {}),
    ...(stack ? { stack } : {}),
  };
}

export function logScriptError(error) {
  console.error(buildSafeErrorForLog(error));
}

export function logPrefixedScriptError(prefix, error) {
  console.error(prefix, buildSafeErrorForLog(error));
}
