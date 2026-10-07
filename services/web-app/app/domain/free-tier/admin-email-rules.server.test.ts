import { expect, test } from 'bun:test';
import { ADMIN_REDIRECT_CHAIN_CAP, evaluateAdminEmail, isConsumerEmailDomain } from './admin-email-rules.server';

test('rejects admin email matching teacher', () => {
  expect(evaluateAdminEmail({ teacherEmail: 't@school.edu', adminEmail: 't@school.edu' }).ok).toBe(false);
});

test('flags consumer domains for manual review', () => {
  const r = evaluateAdminEmail({ teacherEmail: 't@school.edu', adminEmail: 'admin@gmail.com' });
  expect(r.ok && r.manualReview).toBe(true);
});

test('flags domain mismatch', () => {
  const r = evaluateAdminEmail({ teacherEmail: 't@school.edu', adminEmail: 'a@other.edu' });
  expect(r.ok && r.manualReview && r.reason).toBe('domain_mismatch');
});

test('accepts matching school domain', () => {
  const r = evaluateAdminEmail({ teacherEmail: 't@school.edu', adminEmail: 'a@school.edu' });
  expect(r).toEqual({ ok: true, manualReview: false });
});

test('consumer domain set', () => {
  expect(isConsumerEmailDomain('gmail.com')).toBe(true);
});

test('redirect cap constant', () => {
  expect(ADMIN_REDIRECT_CHAIN_CAP).toBe(3);
});
