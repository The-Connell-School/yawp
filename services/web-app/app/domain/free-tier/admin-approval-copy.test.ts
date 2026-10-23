import { expect, test } from 'bun:test';
import {
  adminApprovalEmailPreheader,
  adminApprovalUrlsFromDesignedEmailBody,
  alreadyApprovedBody,
  approveCheckboxError,
  forwardInlineAlert,
  forwardPageIntro,
  forwardPageTitle,
  linkInvalidBodyForRequest,
  linkReplacedBody,
  renderAdminApprovalEmailPlainText,
  renderAdminApprovalEmailSubject,
  adminApprovalTeacherRerouteLead,
  adminApprovalReminderMutedLead,
  adminApprovalTeacherRerouteLeadMarker,
} from './admin-approval-copy';
import {
  ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1,
  renderAdminApprovalEmailBody,
} from './email-copy';

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

test('pass1 E2 reminder muted lead names teacher at school', () => {
  expect(
    adminApprovalReminderMutedLead({
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      pass1: true,
    })
  ).toBe(
    'A quick reminder: Jordan Rivera at Lincoln High School is still waiting on your approval.'
  );
});

test('pass1 E2f forwarded reminder muted lead names forwarder', () => {
  expect(
    adminApprovalReminderMutedLead({
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      forwardedByAdminName: 'Sam Chen',
      pass1: true,
    })
  ).toBe(
    "A quick reminder: Sam Chen forwarded Jordan Rivera's request at Lincoln High School to you, and it's still waiting on your approval."
  );
});

test('pass1 E1 preheader names teacher at school', () => {
  expect(
    adminApprovalEmailPreheader({
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      pass1: true,
    })
  ).toBe(
    'Jordan Rivera at Lincoln High School needs your OK. It takes a couple of minutes, and no Yawp! account is needed.'
  );
});

test('pass1 stored plain text includes reroute marker', () => {
  const text = renderAdminApprovalEmailBody({
    teacherName: 'Jordan Rivera',
    teacherEmail: 'jrivera@lincolnhs.org',
    schoolName: 'Lincoln High School',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    routedByTeacher: true,
    pass1: true,
    copyVersion: ADMIN_APPROVAL_EMAIL_COPY_VERSION_PASS1,
  });
  expect(text).toContain(adminApprovalTeacherRerouteLeadMarker(true));
});

test('pass1 E3b teacher reroute lead and plain text', () => {
  expect(
    adminApprovalTeacherRerouteLead('Jordan Rivera', 'Lincoln High School', true)
  ).toBe(
    'Jordan Rivera asked you to approve classroom software for their class at Lincoln High School.'
  );
  const text = renderAdminApprovalEmailPlainText({
    teacherName: 'Jordan Rivera',
    teacherEmail: 'jrivera@lincolnhs.org',
    schoolName: 'Lincoln High School',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    routedByTeacher: true,
    pass1: true,
  });
  expect(text).toContain(
    'Jordan Rivera asked you to approve classroom software for their class at Lincoln High School.'
  );
  expect(text).toContain(
    "You're getting this because Jordan Rivera named you as an administrator at Lincoln High School."
  );
});

test('forward recipient email names the forwarder', () => {
  const text = renderAdminApprovalEmailPlainText({
    teacherName: 'Jordan Rivera',
    teacherEmail: 'jrivera@lincolnhs.org',
    schoolName: 'Lincoln High School',
    approveUrl: 'https://yawp.school/a',
    notRightPersonUrl: 'https://yawp.school/n',
    forwardedByAdminName: 'Sam Chen',
    pass1: true,
  });
  expect(text).toContain('Sam Chen forwarded this to you');
  expect(text).toContain(
    "You're getting this because Sam Chen forwarded Jordan Rivera's request at Lincoln High School to you."
  );
});

test('checkbox validation copy names teacher and school', () => {
  expect(
    approveCheckboxError('Jordan Rivera', 'Lincoln High School')
  ).toBe(
    'Confirm you can approve classroom software for Jordan Rivera at Lincoln High School.'
  );
});

test('link replaced forwarded body names teacher and school', () => {
  expect(
    linkReplacedBody('Jordan Rivera', 'Lincoln High School', 'forwarded', true)
  ).toBe(
    'The request for Jordan Rivera at Lincoln High School was forwarded to someone else, so this link no longer works. Questions? Email support@yawp.school.'
  );
});

test('link replaced resent body for pass1 resend supersession', () => {
  expect(
    linkReplacedBody('Jordan Rivera', 'Lincoln High School', 'resent', true)
  ).toBe(
    'A newer link was sent for Jordan Rivera at Lincoln High School. Use the most recent email, or email support@yawp.school.'
  );
});

test('invalid link with known request adds pass1 context line', () => {
  expect(
    linkInvalidBodyForRequest({
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      pass1: true,
    })
  ).toBe(
    'This link was for Jordan Rivera at Lincoln High School. It may be incomplete. Copy it again from the email, or email support@yawp.school.'
  );
});

test('already approved body ends with nothing else to do', () => {
  expect(alreadyApprovedBody('Jordan Rivera', 'Lincoln High School')).toBe(
    "Yawp! is already approved for Jordan Rivera at Lincoln High School. There's nothing else to do."
  );
});

test('forward page intro matches pass1 frame', () => {
  expect(forwardPageTitle('Jordan Rivera', true)).toBe(
    'Who should approve Yawp! for Jordan Rivera?'
  );
  expect(forwardPageIntro('Jordan Rivera', 'Lincoln High School', true)).toBe(
    'Who approves classroom software at Lincoln High School? Usually a site or district administrator.'
  );
});

test('pass1 forward inline alerts name teacher and school', () => {
  expect(
    forwardInlineAlert({
      reason: 'same_as_teacher',
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      pass1: true,
    })
  ).toBe(
    "That's Jordan's own email. Enter the administrator who approves classroom software at Lincoln High School."
  );
});
