import { expect, test } from 'bun:test';
import {
  adminApprovalUrlsFromDesignedEmailBody,
  approveCheckboxError,
  linkReplacedBody,
  renderAdminApprovalEmailPlainText,
  renderAdminApprovalEmailSubject,
} from './admin-approval-copy';

test('initial admin approval subject names teacher and school', () => {
  expect(
    renderAdminApprovalEmailSubject({
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    })
  ).toBe('Jordan Rivera at Lincoln High School would like to use Yawp!');
});

test('forward recipient subject asks for approval', () => {
  expect(
    renderAdminApprovalEmailSubject({
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      forwardedByAdminName: 'Sam Chen',
    })
  ).toBe(
    'Can you approve Yawp! for Jordan Rivera at Lincoln High School?'
  );
});

test('admin approval plain text includes link lines and footer', () => {
  const text = renderAdminApprovalEmailPlainText({
    teacherName: 'Jordan Rivera',
    teacherEmail: 'jrivera@lincolnhs.org',
    schoolName: 'Lincoln High School',
    approveUrl: 'https://yawp.school/free/admin/approve?t=a',
    notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person?t=n',
  });
  expect(text).toContain(
    'Approve Yawp! for Jordan Rivera at Lincoln High School'
  );
  expect(text).toContain(
    'They named you as the administrator who can approve classroom software.'
  );
  expect(text).toContain('Review and approve:');
  expect(text).toContain('https://yawp.school/free/admin/approve?t=a');
  expect(text).toContain('Not the right person? Forward this request:');
  expect(text).toContain("You don't need a Yawp! account.");
  expect(adminApprovalUrlsFromDesignedEmailBody(text)).toEqual({
    approveUrl: 'https://yawp.school/free/admin/approve?t=a',
    notRightPersonUrl: 'https://yawp.school/free/admin/not-right-person?t=n',
  });
});

test('forward recipient email names the forwarder', () => {
  const text = renderAdminApprovalEmailPlainText({
    teacherName: 'Jordan Rivera',
    teacherEmail: 'jrivera@lincolnhs.org',
    schoolName: 'Lincoln High School',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    forwardedByAdminName: 'Sam Chen',
  });
  expect(text).toContain('Sam Chen forwarded this to you');
});

test('checkbox validation copy names teacher and school', () => {
  expect(
    approveCheckboxError('Jordan Rivera', 'Lincoln High School')
  ).toBe(
    'Confirm you can approve classroom software for Jordan Rivera at Lincoln High School.'
  );
});

test('link replaced body names teacher and school', () => {
  expect(linkReplacedBody('Jordan Rivera', 'Lincoln High School')).toBe(
    'The request for Jordan Rivera at Lincoln High School was forwarded to someone else, so this link no longer works. Questions? Email support@yawp.school.'
  );
});
