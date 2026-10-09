import { z } from 'zod';
import { normalizeEmail } from './normalize-email';
import { normalizeUsername, validateUsername } from './username';

export function parseLoginIdentifier(raw: string): {
  kind: 'email' | 'username';
  value: string;
} {
  const trimmed = raw.trim();
  if (trimmed.includes('@')) {
    return { kind: 'email', value: normalizeEmail(trimmed) };
  }
  return { kind: 'username', value: normalizeUsername(trimmed) };
}

export const LoginEmailOrHandleSchema = z
  .string({ required_error: 'Email or handle is required' })
  .min(1, 'Email or handle is required')
  .max(100, 'Email or handle is too long')
  .superRefine((value, ctx) => {
    const trimmed = value.trim();
    if (trimmed.includes('@')) {
      const email = normalizeEmail(trimmed);
      if (!email || !z.string().email().safeParse(email).success) {
        ctx.addIssue({
          code: 'custom',
          message: 'Email is invalid',
        });
      }
      return;
    }
    const result = validateUsername(trimmed);
    if (!result.ok) {
      ctx.addIssue({ code: 'custom', message: result.message });
    }
  })
  .transform((value) => parseLoginIdentifier(value).value);
