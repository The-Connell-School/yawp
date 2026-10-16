import { expect, test } from 'bun:test';
import { mailboxIdentity, selfAdminEmailError } from './admin-email';

const message = "Use your administrator's email here, not your own.";

test.each([
  ['teacher@district.org', 'teacher@district.org'],
  [' Teacher@District.org ', ' TEACHER@district.ORG '],
  ['teacher@district.org', 'teacher+qa@district.org'],
  ['teacher+account@district.org', 'teacher@district.org'],
  ['teacher+account@district.org', 'teacher+qa@district.org'],
  ['t.e.a.c.h.e.r+account@googlemail.com', 'Teacher+qa@gmail.com'],
])('rejects equivalent teacher/admin mailboxes: %s / %s', (teacher, admin) => {
  expect(selfAdminEmailError(teacher, admin)).toBe(message);
  expect(mailboxIdentity(teacher)).toBe(mailboxIdentity(admin));
});

test.each([
  ['teacher@district.org', 'principal@district.org'],
  ['teacher@district.org', 'teacher@other.org'],
  ['teacher@gmail.com', 'principal@gmail.com'],
  ['first.last@district.org', 'firstlast@district.org'],
  ['teacher@district.org', ''],
])(
  'leaves distinct or empty administrator addresses to existing validation: %s / %s',
  (teacher, admin) => {
    expect(selfAdminEmailError(teacher, admin)).toBeNull();
  }
);
