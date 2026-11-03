import { expect, test } from 'bun:test';
import {
  adminApprovalUrlsFromEmailBody,
  renderAdminApprovalEmailBody,
  renderReleaseEmailBody,
} from './email-copy';

test('release email snapshot', () => {
  expect(renderReleaseEmailBody({ name: 'Ada', joinUrl: 'https://yawp.school/join' })).toMatchSnapshot();
});

test('admin approval email ignores a custom note and retains links', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    personalNote: 'Hi!',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
  });
  expect(body).not.toContain('Hi!');
  expect(body).toContain('https://yawp.school/a');
  expect(body).toMatchSnapshot();
});

test('admin approval email body exposes signed URLs for QA logs', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    approveUrl: 'https://yawp.school/free/admin/approve?t=a',
    notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person?t=n',
  });
  expect(adminApprovalUrlsFromEmailBody(body)).toEqual({
    approveUrl: 'https://yawp.school/free/admin/approve?t=a',
    notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person?t=n',
  });
});

test('forwarded admin email names the forwarder', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    forwardedByAdminName: 'Principal Pat',
  });
  expect(body).toContain('Principal Pat forwarded this to you');
});

test('reminder email includes reminder lead', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    reminder: true,
  });
  expect(body).toContain('This is a reminder about the approval request below.');
});
