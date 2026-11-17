import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { buildAdminApprovalDesignedEmail } from './build-free-tier-emails.server';
import {
  buildClassInviteEmail,
  buildOrgTeacherInviteEmail,
  buildResetPasswordEmail,
  buildSignInCodeEmail,
  buildWelcomeVerifyEmail,
} from './build-account-emails.server';
import { buildTeacherReleaseDesignedEmail } from './build-free-tier-emails.server';
import { FREE_TIER_ADMIN_MODEL_TRAINING_LINE } from '~/domain/free-tier/admin-approval-copy';

const FIXTURE = {
  teacherName: 'Dana Whitaker',
  teacherEmail: 'd.whitaker@lincolnhs.org',
  schoolName: 'Lincoln High School With An Exceptionally Long Name That Should Wrap',
  approveUrl: 'https://yawp.test/free/admin/approve?t=fake',
  forwardUrl: 'https://yawp.test/free/admin/not-right-person?t=fake',
  joinUrl: 'https://yawp.test/free/join?t=fake',
  code: '482913',
};

const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

function assertBrand(copy: { html: string; text: string; subject: string }) {
  expect(copy.subject).toContain('Yawp!');
  expect(copy.text).not.toMatch(/\bAI\b/);
  expect(copy.html).not.toMatch(/\bAI\b/);
  expect(copy.text).not.toMatch(/Yawp!\./);
  expect(copy.html).not.toMatch(/Yawp!\./);
}

describe('transactional email renders', () => {
  test('01 teacher release', async () => {
    const email = await buildTeacherReleaseDesignedEmail({
      name: FIXTURE.teacherName,
      joinUrl: FIXTURE.joinUrl,
    });
    assertBrand(email);
    expect(email.subject).toBe("You're in: start your Yawp! classroom");
    expect(email.text).toContain('Get started:');
    expect(email.html).toContain(
      'Your free classroom license is ready. Setup takes about five minutes.'
    );
    expect(email.html).toContain('alt="Yawp!"');
    expect(email.html).toContain('yawp_black_logo.png');
    expect(email.html).toContain('yawp_white_logo.png');
  });

  test('05 admin approval long names', async () => {
    const email = await buildAdminApprovalDesignedEmail({
      teacherName: FIXTURE.teacherName,
      teacherEmail: FIXTURE.teacherEmail,
      schoolName: FIXTURE.schoolName,
      approveUrl: FIXTURE.approveUrl,
      notRightPersonUrl: FIXTURE.forwardUrl,
      pass1: false,
    });
    assertBrand(email);
    expect(email.text).toContain(FREE_TIER_ADMIN_MODEL_TRAINING_LINE);
    expect(email.html).toContain('word-break:break-word');
    expect(email.html).toContain(FIXTURE.schoolName);
    expect(email.text).toContain('About Yawp!');
  });

  test('08 sign-in code', async () => {
    const email = await buildSignInCodeEmail(FIXTURE.code);
    assertBrand(email);
    expect(email.subject).toBe('Your Yawp! sign-in code');
    expect(email.text).toContain(FIXTURE.code);
    expect(email.html).toContain(FIXTURE.code);
    expect(email.html).toContain(
      'Your code is 482913. It expires in 10 minutes.'
    );
  });

  test('09 reset password', async () => {
    const email = await buildResetPasswordEmail({
      code: FIXTURE.code,
      resetUrl: 'https://yawp.test/reset/fake',
    });
    assertBrand(email);
    expect(email.subject).toBe('Reset your Yawp! password');
    expect(email.html).toContain('Reset password</a>');
  });

  test('10 welcome verify', async () => {
    const email = await buildWelcomeVerifyEmail({
      firstName: 'Jordan',
      code: FIXTURE.code,
      verifyUrl: 'https://yawp.test/verify/fake',
    });
    assertBrand(email);
    expect(email.html).toContain('Verify and get started</a>');
  });

  test('teacher invite fallback URL is escaped once in HTML', async () => {
    const acceptUrl =
      'https://yawp.test/auth/inv/verify?type=onboard-teacher&target=teacher%40school.edu&code=ABC123';
    const email = await buildOrgTeacherInviteEmail({
      firstName: 'Jordan',
      inviterName: 'Ms. Whitaker',
      schoolName: 'Lincoln High',
      acceptUrl,
    });
    expect(email.html).toContain(
      'type=onboard-teacher&amp;target=teacher%40school.edu&amp;code=ABC123'
    );
    expect(email.html).not.toContain('&amp;amp;');
    expect(email.html).toContain(
      'href="https://yawp.test/auth/inv/verify?type=onboard-teacher&amp;target=teacher%40school.edu&amp;code=ABC123"'
    );
  });

  test('11 class invite', async () => {
    const email = await buildClassInviteEmail({
      teacherName: 'Ms. Whitaker',
      className: 'English 10, Period 3',
      schoolName: FIXTURE.schoolName,
      joinUrl: 'https://yawp.test/join/fake',
    });
    assertBrand(email);
    expect(email.subject).toContain('English 10, Period 3');
  });
});
