import { z } from 'zod';

export const StudentNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter your name.')
  .max(80, 'Use at most 80 characters.')
  .regex(
    /^\p{L}[\p{L}\p{M}]*(?:[ '\u2019-]\p{L}[\p{L}\p{M}]*)*$/u,
    'Use letters, spaces, apostrophes or hyphens.'
  );
export const HANDLE_ATTEMPTS = 100;
export function studentHandleBase(firstName: string, lastName: string) {
  const clean = (value: string) =>
    StudentNameSchema.parse(value)
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .replace(/[ '\u2019-]/g, '');
  return Array.from(clean(firstName) + clean(lastName))
    .slice(0, 30)
    .join('');
}
export function handleCandidate(base: string, attempt: number) {
  const suffix = attempt ? String(attempt) : '';
  return (
    Array.from(base)
      .slice(0, 30 - suffix.length)
      .join('') + suffix
  );
}
