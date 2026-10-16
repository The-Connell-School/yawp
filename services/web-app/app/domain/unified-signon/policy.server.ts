import { createHmac } from 'node:crypto';
import { safeRedirect } from 'remix-utils/safe-redirect';
import { EmailSchema } from '~/utils/schemas/user';
import { validateUsername } from '~/utils/username';

export function normalizeIdentifier(raw: string) {
  const value = raw.trim().toLowerCase();
  if (!value || value.length > 100) return null;
  if (value.includes('@') && !value.startsWith('@'))
    return EmailSchema.safeParse(value).success
      ? { kind: 'email' as const, value }
      : null;
  const canonical = value.replace(/^@/, '');
  if (
    value.startsWith('@')
      ? !validateUsername(canonical).ok
      : !/^[a-z0-9._-]+$/.test(canonical)
  )
    return null;
  return {
    kind: value.startsWith('@')
      ? ('handle' as const)
      : ('handle-or-code' as const),
    value: canonical,
  };
}

export function postAuthenticationDestination(input: {
  mustChangePassword: boolean;
  activeMemberships: number;
  trialDestination: string | null;
  redirectTo: string;
}) {
  if (input.mustChangePassword) return '/auth/required-password-change';
  // A free-trial application decides the next page even before the account
  // has any active role (for example a student account applying to teach).
  if (input.trialDestination) return input.trialDestination;
  if (!input.activeMemberships) return 'inactive';
  if (input.activeMemberships > 1) return 'membership';
  return safeRedirect(input.redirectTo, '/app');
}

export function codeDigest(context: Record<string, string>, code: string) {
  return createHmac('sha256', process.env.SESSION_SECRET.split(',')[0])
    .update(
      JSON.stringify(
        Object.entries(context).sort(([a], [b]) => a.localeCompare(b))
      )
    )
    .update('\0')
    .update(code)
    .digest('hex');
}
