import { expect, test } from 'bun:test';
import {
  ADMIN_REDIRECT_CHAIN_CAP,
  evaluateAdminEmail,
  mailboxIdentity,
} from './admin-email-rules.server';
import { isConsumerEmailDomain } from './consumer-email-domains';

test('rejects admin email matching teacher', () => {
  expect(evaluateAdminEmail({ teacherEmail: 't@school.edu', adminEmail: 't@school.edu' }).ok).toBe(false);
});

test('rejects plus-tag alias of teacher mailbox', () => {
  expect(
    evaluateAdminEmail({ teacherEmail: 'teacher@school.edu', adminEmail: 'teacher+alias@school.edu' }).ok
  ).toBe(false);
});

test('normalizes gmail dots and plus tags', () => {
  expect(mailboxIdentity('t.e.a.c.h.e.r@gmail.com')).toBe(mailboxIdentity('teacher+alias@gmail.com'));
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
