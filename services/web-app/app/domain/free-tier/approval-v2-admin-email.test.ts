import { beforeEach, afterEach, expect, test } from 'bun:test';
import { buildDesignedAdminApprovalEmail } from './admin-approval-email.server';
import { teacherAtSchool } from './admin-approval-copy';

const teacherName = 'Jordan Rivera';
const schoolName = 'Lincoln High School';
const teacherEmail = 'jrivera@lincolnhs.org';
const approveUrl = 'https://yawp.test/free/admin/approve?t=fake-approve';
const notRightPersonUrl =
  'https://yawp.test/free/admin/not-right-person?t=fake-forward';

async function expectDesignedAdminEmail(
  designedPromise: ReturnType<typeof buildDesignedAdminApprovalEmail>,
  options: {
    reminder?: boolean;
    forwardedByAdminName?: string;
    pass1?: boolean;
  } = {}
) {
  const pass1 = options.pass1 ?? true;
  const designed = await designedPromise;
  const atSchool = teacherAtSchool(teacherName, schoolName);
  if (options.forwardedByAdminName) {
    expect(designed.subject).toBe(`Can you approve Yawp! for ${atSchool}?`);
    if (pass1) {
      expect(designed.text).toContain(
        `${options.forwardedByAdminName} forwarded ${teacherName}'s request at ${schoolName} to you.`
      );
    } else {
      expect(designed.text).toContain(
        `${options.forwardedByAdminName} forwarded this to you`
      );
    }
  } else if (options.reminder) {
    expect(designed.subject).toBe(
      `Reminder: ${atSchool} would like to use Yawp!`
    );
    if (pass1) {
      expect(designed.text).toContain(
        'A quick reminder: Jordan Rivera at Lincoln High School is still waiting on your approval.'
      );
    } else {
      expect(designed.text).toContain(
        'This is a reminder about the approval request below.'
      );
    }
  } else {
    expect(designed.subject).toBe(`${atSchool} would like to use Yawp!`);
  }
  expect(designed.text).toContain(`Approve Yawp! for ${atSchool}`);
  expect(designed.text).toContain('Review and approve:');
  expect(designed.text).toContain(approveUrl);
  expect(designed.html).toContain('Review and approve</a>');
  expect(designed.html).toContain(`href="${approveUrl}"`);
  expect(designed.html).toContain(`Approve Yawp! for ${atSchool}`);
  expect(designed.html).toContain('yawp_black_logo.png');
  expect(designed.html).toContain('yawp_white_logo.png');
  expect(designed.html).toContain('color-scheme');
  expect(designed.text).not.toMatch(/\bAI\b/);
  return designed;
}

const primary = process.env.PRIMARY_APP_URL;
beforeEach(() => {
  process.env.PRIMARY_APP_URL = 'https://yawp.test';
});
afterEach(() => {
  if (primary === undefined) delete process.env.PRIMARY_APP_URL;
  else process.env.PRIMARY_APP_URL = primary;
});

test('approval v2 delivery uses designed approval email', async () => {
  await expectDesignedAdminEmail(
    buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      pass1: true,
    }),
    { pass1: true }
  );
});

test('approval v2 reminder uses designed reminder email', async () => {
  await expectDesignedAdminEmail(
    buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      reminder: true,
      pass1: true,
    }),
    { reminder: true, pass1: true }
  );
});

test('approval v2 forward recipient uses designed forward email', async () => {
  await expectDesignedAdminEmail(
    buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      forwardedByAdminName: 'Sam Chen',
      pass1: true,
    }),
    { forwardedByAdminName: 'Sam Chen', pass1: true }
  );
});
