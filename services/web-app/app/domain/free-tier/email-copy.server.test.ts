import { expect, test } from 'bun:test';
import { renderAdminApprovalEmailBody, renderReleaseEmailBody } from './email-copy.server';

test('release email snapshot', () => {
  expect(renderReleaseEmailBody({ name: 'Ada', joinUrl: 'https://yawp.school/join' })).toMatchSnapshot();
});

test('admin approval email includes note and links', () => {
  const body = renderAdminApprovalEmailBody({
    teacherName: 'Ada',
    schoolName: 'Example HS',
    personalNote: 'Hi!',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
  });
  expect(body).toContain('Hi!');
  expect(body).toContain('https://yawp.school/a');
  expect(body).toMatchSnapshot();
});
