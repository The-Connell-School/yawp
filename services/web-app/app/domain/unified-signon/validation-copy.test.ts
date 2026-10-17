import { expect, test } from 'bun:test';
import { PasswordAndConfirmPasswordSchema, PasswordSchema } from '~/utils/schemas/user';
import { signonValidationMessage } from './validation-copy';

test('gated password copy uses the validator minimum and mismatch text', () => {
  const result = PasswordAndConfirmPasswordSchema.safeParse({ password: 'short', confirmPassword: 'different' });
  if (result.success) throw new Error('Expected invalid credentials');
  expect(Object.fromEntries(result.error.issues.map(i => [String(i.path[0]), signonValidationMessage(i)]))).toEqual({
    password: `Use at least ${PasswordSchema.minLength} characters.`,
    confirmPassword: "These passwords don't match.",
  });
});

test('required fields, upper bound and unrelated issues keep their messages', () => {
  for (const values of [{}, { password: 'x'.repeat(101), confirmPassword: 'x'.repeat(101) }]) {
    const result = PasswordAndConfirmPasswordSchema.safeParse(values);
    if (result.success) throw new Error('Expected validation failure');
    for (const issue of result.error.issues) expect(signonValidationMessage(issue)).toBe(issue.message);
  }
  expect(signonValidationMessage({ code: 'too_small', type: 'string', inclusive: true, minimum: 3, path: ['name'], message: 'Name is too short' })).toBe('Name is too short');
});

test('shared policy and legacy messages remain unchanged at both password boundaries', () => {
  expect(PasswordSchema.minLength).toBe(6);
  expect(PasswordSchema.maxLength).toBe(100);
  for (const length of [6, 100]) expect(PasswordAndConfirmPasswordSchema.safeParse({ password: 'x'.repeat(length), confirmPassword: 'x'.repeat(length) }).success).toBe(true);
  const invalid = PasswordAndConfirmPasswordSchema.safeParse({ password: 'short', confirmPassword: 'different' });
  if (invalid.success) throw new Error('Expected legacy validation failure');
  expect(invalid.error.issues.map(i => i.message)).toEqual(['Password is too short', 'The passwords must match']);
});

test('confirmation minimum and empty strings keep existing validation semantics', () => {
  for (const values of [
    { password: '123456', confirmPassword: 'short' },
    { password: '', confirmPassword: '' },
  ]) {
    const result = PasswordAndConfirmPasswordSchema.safeParse(values);
    if (result.success) throw new Error('Expected validation failure');
    for (const issue of result.error.issues) {
      if (issue.code === 'too_small') expect(signonValidationMessage(issue)).toBe(`Use at least ${issue.minimum} characters.`);
      else if (issue.code === 'custom') expect(signonValidationMessage(issue)).toBe("These passwords don't match.");
      else expect(signonValidationMessage(issue)).toBe(issue.message);
    }
  }
});
