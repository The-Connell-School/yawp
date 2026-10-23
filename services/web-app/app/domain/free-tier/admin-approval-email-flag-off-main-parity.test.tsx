import { beforeEach, afterEach, expect, mock, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled: async () => true,
}));

const {
  adminApprovalEmailPreheader,
  adminApprovalFooterWhy,
  adminApprovalTeacherRerouteLeadMarker,
  renderAdminApprovalEmailPlainText,
} = await import('./admin-approval-copy');
const { buildDesignedAdminApprovalEmail } = await import(
  './admin-approval-email.server'
);
const { AdminApprovalEmail } = await import('~/emails/transactional-emails');

const teacherName = 'Jordan Rivera';
const schoolName = 'Lincoln High School';
const teacherEmail = 'jrivera@lincolnhs.org';
const approveUrl = 'https://yawp.test/free/admin/approve?t=fake';
const notRightPersonUrl = 'https://yawp.test/free/admin/not-right-person?t=fake';
const forwarder = 'Sam Chen';

/** Wording frozen to main @ 071a23ea (free-tier flag off / no pass1). */
function mainLegacyPlainText(args: {
  reminder?: boolean;
  forwardedByAdminName?: string | null;
}) {
  return renderAdminApprovalEmailPlainText({
    teacherName,
    teacherEmail,
    schoolName,
    approveUrl,
    notRightPersonUrl,
    forwardedByAdminName: args.forwardedByAdminName,
    reminder: args.reminder,
    pass1: false,
    routedByTeacher: false,
  });
}

function mainLegacyPreheader(args: {
  reminder?: boolean;
  forwardedByAdminName?: string | null;
}) {
  return adminApprovalEmailPreheader({
    teacherName,
    schoolName,
    reminder: args.reminder,
    forwardedByAdminName: args.forwardedByAdminName,
    pass1: false,
  });
}

function mainLegacyFooterWhy(args: {
  forwardedByAdminName?: string | null;
}) {
  return adminApprovalFooterWhy({
    teacherName,
    schoolName,
    forwardedByAdminName: args.forwardedByAdminName,
    pass1: false,
    routedByTeacher: false,
  });
}

const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

test('flag off: teacher reroute email matches main first-request copy', async () => {
  const baseline = await buildDesignedAdminApprovalEmail({
    teacherName,
    teacherEmail,
    schoolName,
    approveUrl,
    notRightPersonUrl,
    pass1: false,
  });
  const reroute = await buildDesignedAdminApprovalEmail({
    teacherName,
    teacherEmail,
    schoolName,
    approveUrl,
    notRightPersonUrl,
    routedByTeacher: true,
    pass1: false,
  });
  expect(reroute.subject).toBe(baseline.subject);
  expect(reroute.text).toBe(baseline.text);
  expect(reroute.text).toBe(mainLegacyPlainText({}));
  expect(mainLegacyPreheader({})).toBe(
    "Review the request in a couple of minutes. You don't need a Yawp! account."
  );
  const html = renderToStaticMarkup(
    <AdminApprovalEmail
      teacherName={teacherName}
      teacherEmail={teacherEmail}
      schoolName={schoolName}
      approveUrl={approveUrl}
      notRightPersonUrl={notRightPersonUrl}
      routedByTeacher
      pass1={false}
    />
  );
  expect(html).not.toContain(adminApprovalTeacherRerouteLeadMarker(true));
  expect(html).not.toContain(adminApprovalTeacherRerouteLeadMarker(false));
});

test('flag off: forwarded-admin reminder matches main', async () => {
  const designed = await buildDesignedAdminApprovalEmail({
    teacherName,
    teacherEmail,
    schoolName,
    approveUrl,
    notRightPersonUrl,
    reminder: true,
    forwardedByAdminName: forwarder,
    pass1: false,
  });
  expect(designed.text).toBe(
    mainLegacyPlainText({ reminder: true, forwardedByAdminName: forwarder })
  );
  expect(mainLegacyPreheader({ reminder: true })).toBe(
    `${teacherName}'s request is still open. It takes a couple of minutes.`
  );
  expect(mainLegacyFooterWhy({ forwardedByAdminName: forwarder })).toBe(
    `You're getting this because ${forwarder} forwarded ${teacherName}'s request to you.`
  );
});

test('flag off: reminder after teacher reroute matches main first-admin reminder', async () => {
  const baselineReminder = await buildDesignedAdminApprovalEmail({
    teacherName,
    teacherEmail,
    schoolName,
    approveUrl,
    notRightPersonUrl,
    reminder: true,
    pass1: false,
  });
  const rerouteReminder = await buildDesignedAdminApprovalEmail({
    teacherName,
    teacherEmail,
    schoolName,
    approveUrl,
    notRightPersonUrl,
    reminder: true,
    routedByTeacher: true,
    pass1: false,
  });
  expect(rerouteReminder.text).toBe(baselineReminder.text);
  expect(rerouteReminder.text).toBe(mainLegacyPlainText({ reminder: true }));
});
