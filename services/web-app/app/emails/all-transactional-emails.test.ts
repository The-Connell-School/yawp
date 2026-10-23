import { afterEach, beforeEach, expect, test } from 'bun:test';
import {
  buildAdminApprovalDesignedEmail,
  buildTeacherApprovedDesignedEmail,
  buildTeacherForwardedDesignedEmail,
  buildTeacherReleaseDesignedEmail,
  buildTeacherStillWaitingDesignedEmail,
} from './build-free-tier-emails.server';
import {
  buildClassInviteEmail,
  buildOrgTeacherInviteEmail,
  buildResetPasswordEmail,
  buildSchoolSetupInviteEmail,
  buildSignInCodeEmail,
  buildWelcomeVerifyEmail,
} from './build-account-emails.server';

const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

const urls = {
  join: 'https://yawp.test/free/join?t=fake',
  pending: 'https://yawp.test/app/free-tier/pending',
  approve: 'https://yawp.test/free/admin/approve?t=fake',
  forward: 'https://yawp.test/free/admin/not-right-person?t=fake',
  signIn: 'https://yawp.test/auth/login',
};

const emails = [
  {
    id: '01',
    build: () =>
      buildTeacherReleaseDesignedEmail({
        name: 'Dana Whitaker',
        joinUrl: urls.join,
      }),
    subject: "You're in: start your Yawp! classroom",
    preheader: 'Your free classroom license is ready',
  },
  {
    id: '02',
    build: () =>
      buildTeacherStillWaitingDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        exploreUrl: urls.pending,
        changeAdminUrl: urls.pending,
      }),
    subject: 'Your Yawp! classroom is still waiting on approval',
    preheader: 'We sent Dr. Ramos a friendly reminder',
  },
  {
    id: '03a',
    build: () =>
      buildTeacherForwardedDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        adminEmail: 'm.ramos@lincolnhs.org',
        manualReview: false,
        pendingUrl: urls.pending,
      }),
    subject: 'Your Yawp! approval request was forwarded',
    preheader: "We'll let you know the moment they approve",
  },
  {
    id: '03b',
    build: () =>
      buildTeacherForwardedDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        adminEmail: 'm.ramos@lincolnhs.org',
        manualReview: true,
        pendingUrl: urls.pending,
      }),
    subject: 'Your Yawp! approval request was forwarded',
    preheader: 'Our team is reviewing the new request',
  },
  {
    id: '04',
    build: () =>
      buildTeacherApprovedDesignedEmail({
        teacherName: 'Dana Whitaker',
        adminName: 'Dr. Ramos',
        signInUrl: urls.signIn,
      }),
    subject: "You're approved! Your Yawp! classroom is ready",
    preheader: 'Dr. Ramos approved your classroom',
  },
  {
    id: '05',
    build: () =>
      buildAdminApprovalDesignedEmail({
        teacherName: 'Dana Whitaker',
        teacherEmail: 'd.whitaker@lincolnhs.org',
        schoolName: 'Lincoln High School',
        approveUrl: urls.approve,
        notRightPersonUrl: urls.forward,
        pass1: false,
      }),
    subject: 'Dana Whitaker at Lincoln High School would like to use Yawp!',
    preheader: "You don't need a Yawp! account",
  },
  {
    id: '06',
    build: () =>
      buildAdminApprovalDesignedEmail({
        teacherName: 'Dana Whitaker',
        teacherEmail: 'd.whitaker@lincolnhs.org',
        schoolName: 'Lincoln High School',
        approveUrl: urls.approve,
        notRightPersonUrl: urls.forward,
        forwardedByAdminName: 'Ms. Patel',
        pass1: false,
      }),
    subject: 'Can you approve Yawp! for Dana Whitaker at Lincoln High School?',
    preheader: 'Ms. Patel forwarded this to you',
  },
  {
    id: '07',
    build: () =>
      buildAdminApprovalDesignedEmail({
        teacherName: 'Dana Whitaker',
        teacherEmail: 'd.whitaker@lincolnhs.org',
        schoolName: 'Lincoln High School',
        approveUrl: urls.approve,
        notRightPersonUrl: urls.forward,
        reminder: true,
        pass1: false,
      }),
    subject:
      'Reminder: Dana Whitaker at Lincoln High School would like to use Yawp!',
    preheader: 'request is still open',
  },
  {
    id: '08',
    build: () => buildSignInCodeEmail('482913'),
    subject: 'Your Yawp! sign-in code',
    preheader: 'Your code is 482913',
  },
  {
    id: '09',
    build: () =>
      buildResetPasswordEmail({
        code: '482913',
        resetUrl: 'https://yawp.test/reset/fake',
      }),
    subject: 'Reset your Yawp! password',
    preheader: 'Use code 482913',
  },
  {
    id: '10',
    build: () =>
      buildWelcomeVerifyEmail({
        firstName: 'Jordan',
        code: '482913',
        verifyUrl: 'https://yawp.test/verify/fake',
      }),
    subject: 'Welcome to Yawp!',
    preheader: 'Verify your email to join your class',
  },
  {
    id: '11',
    build: () =>
      buildClassInviteEmail({
        teacherName: 'Ms. Whitaker',
        className: 'English 10, Period 3',
        schoolName: 'Lincoln High School',
        joinUrl: 'https://yawp.test/join/fake',
      }),
    subject: 'invited you to join English 10, Period 3 on Yawp!',
    preheader: 'This invitation expires in 3 days',
  },
  {
    id: '12',
    build: () =>
      buildOrgTeacherInviteEmail({
        firstName: 'Alex',
        inviterName: 'Sam Ortiz',
        schoolName: 'Lincoln High School',
        acceptUrl: 'https://yawp.test/invite/fake',
      }),
    subject: 'Sam Ortiz invited you to join Lincoln High School on Yawp!',
    preheader: 'Accept to set up your classes',
  },
  {
    id: '13',
    build: () =>
      buildSchoolSetupInviteEmail({
        firstName: 'Dr. Okafor',
        schoolName: 'Lincoln High School',
        acceptUrl: 'https://yawp.test/invite/owner/fake',
        expiresInDays: 7,
        personalNote: 'Thanks for the call on Tuesday.',
      }),
    subject: 'Set up Lincoln High School on Yawp!',
    preheader: 'This invitation expires in 7 days',
  },
] as const;

for (const spec of emails) {
  test(`email ${spec.id} html and plain text`, async () => {
    const rendered = await spec.build();
    expect(rendered.subject).toContain('Yawp!');
    expect(rendered.html.length).toBeGreaterThan(500);
    expect(rendered.text.length).toBeGreaterThan(80);
    expect(rendered.html).toContain(spec.preheader);
    expect(rendered.html).toContain('yawp_black_logo.png');
    expect(rendered.html).toContain('yawp_white_logo.png');
    expect(rendered.html).toContain('alt="Yawp!"');
    expect(rendered.text).not.toMatch(/\bAI\b/);
    if (spec.id === '05') {
      expect(rendered.html).toContain('word-break:break-word');
    }
  });
}

test('05L long-name admin headline wraps in html', async () => {
  const longSchool =
    'Lincoln High School for Advanced Literary Studies and Creative Writing';
  const rendered = await buildAdminApprovalDesignedEmail({
    teacherName: 'Professor Alexandra Montgomery-Wellington',
    teacherEmail: 'alexandra.montgomery-wellington@very-long-school-domain.example.edu',
    schoolName: longSchool,
    approveUrl: urls.approve,
    notRightPersonUrl: urls.forward,
    pass1: false,
  });
  expect(rendered.html).toContain(longSchool);
  expect(rendered.html).toContain('overflow-wrap:anywhere');
});
