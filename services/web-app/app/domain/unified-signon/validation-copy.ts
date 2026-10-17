import type { ZodIssue } from 'zod';

export function signonValidationMessage(issue: ZodIssue): string {
  return issue.message;
}
