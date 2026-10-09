import { expect, test } from 'bun:test';
import { renderAdminApprovalEmailBody, renderReleaseEmailBody } from './email-copy';

test('release email snapshot', () => {
  expect(renderReleaseEmailBody({ name: 'Ada', joinUrl: 'https://yawp.school/join' })).toMatchSnapshot();
});

test('admin approval email includes note and links', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    personalNote: 'Hi!',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
  });
  expect(body).toContain('Hi!');
  expect(body).toContain('https://yawp.school/a');
  expect(body).toMatchSnapshot();
});

test('forwarded admin email greets the new administrator', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    adminRecipientName: 'Principal Pat',
  });
  expect(body).toContain('Hi Principal Pat,');
  expect(body).not.toContain('Hi Wrong Person');
});

test('reminder email includes reminder lead and copy version', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    teacherEmail: 'ada@example.edu',
    schoolName: 'Example HS',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    reminderLead: 'This is a reminder about the approval request below.',
  });
  expect(body).toContain('This is a reminder about the approval request below.');
  expect(body).not.toContain('Copy version:');
});
