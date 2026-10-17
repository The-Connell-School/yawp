import type { ZodIssue } from 'zod';

/** Gated presentation only: shared validators and legacy messages stay intact. */
export function signonValidationMessage(issue: ZodIssue): string {
  if (
    issue.path.length === 1 &&
    ['password', 'confirmPassword'].includes(String(issue.path[0])) &&
    issue.code === 'too_small' &&
    issue.type === 'string'
  )
    return `Use at least ${issue.minimum} characters.`;
  if (
    issue.path.length === 1 &&
    issue.path[0] === 'confirmPassword' &&
    issue.code === 'custom' &&
    issue.message === 'The passwords must match'
  )
    return "These passwords don't match.";
  return issue.message;
}
