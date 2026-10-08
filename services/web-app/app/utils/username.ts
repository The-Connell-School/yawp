export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_PATTERN = /^[a-z0-9._-]+$/;

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'yawp',
  'support',
  'help',
  'teacher',
  'student',
  'staff',
  'root',
  'system',
  'moderator',
  'mod',
  'owner',
  'login',
  'signup',
  'signin',
  'sign-in',
  'sign-up',
  'auth',
  'api',
  'www',
  'mail',
  'postmaster',
  'noreply',
  'no-reply',
  'null',
  'undefined',
  'test',
  'demo',
]);

export type UsernameValidationResult =
  | { ok: true; username: string }
  | { ok: false; code: string; message: string };

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): UsernameValidationResult {
  const username = normalizeUsername(raw);
  if (!username) {
    return { ok: false, code: 'required', message: 'Handle is required.' };
  }
  if (username.includes('@')) {
    return {
      ok: false,
      code: 'invalid_chars',
      message: 'Handles cannot contain @.',
    };
  }
  if (username.length < USERNAME_MIN_LENGTH) {
    return {
      ok: false,
      code: 'too_short',
      message: `Handle must be at least ${USERNAME_MIN_LENGTH} characters.`,
    };
  }
  if (username.length > USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      code: 'too_long',
      message: `Handle must be at most ${USERNAME_MAX_LENGTH} characters.`,
    };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      code: 'invalid_chars',
      message:
        'Use only lowercase letters, numbers, dots, underscores, or hyphens.',
    };
  }
  if (RESERVED_USERNAMES.has(username)) {
    return {
      ok: false,
      code: 'reserved',
      message: 'This handle is reserved. Try another.',
    };
  }
  return { ok: true, username };
}
