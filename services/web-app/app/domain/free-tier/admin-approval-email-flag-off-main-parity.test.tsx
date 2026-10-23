import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

/** Golden copy frozen from main @ 7b203f73 (free-tier flag off). */
const MAIN_FLAG_OFF = {
  teacherName: 'Jordan Rivera',
  schoolName: 'Lincoln High School',
  teacherEmail: 'jrivera@lincolnhs.org',
  forwarder: 'Sam Chen',
  approveUrl: 'https://yawp.test/free/admin/approve?t=fake',
  notRightPersonUrl: 'https://yawp.test/free/admin/not-right-person?t=fake',
  firstSubject: 'Jordan Rivera at Lincoln High School would like to use Yawp!',
  forwardSubject:
    'Can you approve Yawp! for Jordan Rivera at Lincoln High School?',
  firstPreheader:
    "Review the request in a couple of minutes. You don't need a Yawp! account.",
  reminderPreheader:
    "Jordan Rivera's request is still open. It takes a couple of minutes.",
  forwardBanner:
    'Sam Chen forwarded this to you as the right person to approve classroom software for Jordan Rivera at Lincoln High School.',
  forwardFooterWhy:
    "You're getting this because Sam Chen forwarded Jordan Rivera's request to you.",
} as const;

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled: async () => false,
}));

const { buildDesignedAdminApprovalEmail } = await import(
  './admin-approval-email.server'
);
const { AdminApprovalEmail } = await import('~/emails/transactional-emails');

const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

test('flag off: teacher reroute uses previous admin as forwarder (main 7b203f73)', async () => {
  const reroute = await buildDesignedAdminApprovalEmail({
    teacherName: MAIN_FLAG_OFF.teacherName,
    teacherEmail: MAIN_FLAG_OFF.teacherEmail,
    schoolName: MAIN_FLAG_OFF.schoolName,
    approveUrl: MAIN_FLAG_OFF.approveUrl,
    notRightPersonUrl: MAIN_FLAG_OFF.notRightPersonUrl,
    forwardedByAdminName: MAIN_FLAG_OFF.forwarder,
    pass1: false,
  });
  expect(reroute.subject).toBe(MAIN_FLAG_OFF.forwardSubject);
  expect(reroute.text).toContain(MAIN_FLAG_OFF.forwardBanner);
  expect(reroute.text).toContain(MAIN_FLAG_OFF.forwardFooterWhy);
  expect(reroute.text).not.toContain('They named you as the administrator');
});

test('flag off: first admin request matches main golden plain text', async () => {
  const first = await buildDesignedAdminApprovalEmail({
    teacherName: MAIN_FLAG_OFF.teacherName,
    teacherEmail: MAIN_FLAG_OFF.teacherEmail,
    schoolName: MAIN_FLAG_OFF.schoolName,
    approveUrl: MAIN_FLAG_OFF.approveUrl,
    notRightPersonUrl: MAIN_FLAG_OFF.notRightPersonUrl,
    pass1: false,
  });
  expect(first.subject).toBe(MAIN_FLAG_OFF.firstSubject);
  expect(first.text).toContain(
    'They named you as the administrator who can approve classroom software'
  );
});

test('flag off: forwarded-admin reminder has no forwarder (main)', async () => {
  const reminder = await buildDesignedAdminApprovalEmail({
    teacherName: MAIN_FLAG_OFF.teacherName,
    teacherEmail: MAIN_FLAG_OFF.teacherEmail,
    schoolName: MAIN_FLAG_OFF.schoolName,
    approveUrl: MAIN_FLAG_OFF.approveUrl,
    notRightPersonUrl: MAIN_FLAG_OFF.notRightPersonUrl,
    reminder: true,
    pass1: false,
  });
  expect(reminder.text).toContain(
    'This is a reminder about the approval request below.'
  );
  expect(reminder.text).not.toContain('forwarded this to you');
  expect(reminder.text).not.toContain(MAIN_FLAG_OFF.forwardFooterWhy);
});

test('flag off: HTML forward banner is a single text node (no comment splits)', () => {
  const html = renderToStaticMarkup(
    <AdminApprovalEmail
      teacherName={MAIN_FLAG_OFF.teacherName}
      teacherEmail={MAIN_FLAG_OFF.teacherEmail}
      schoolName={MAIN_FLAG_OFF.schoolName}
      approveUrl={MAIN_FLAG_OFF.approveUrl}
      notRightPersonUrl={MAIN_FLAG_OFF.notRightPersonUrl}
      forwardedByAdminName={MAIN_FLAG_OFF.forwarder}
      pass1={false}
    />
  );
  expect(html).toContain(MAIN_FLAG_OFF.forwardBanner);
  expect(html).not.toContain('<!-- -->');
});
