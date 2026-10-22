import { expect, test } from 'bun:test';
import { buildDesignedAdminApprovalEmail } from './admin-approval-email.server';
import { teacherAtSchool } from './admin-approval-copy';

const teacherName = 'Jordan Rivera';
const schoolName = 'Lincoln High School';
const teacherEmail = 'jrivera@lincolnhs.org';
const approveUrl = 'https://yawp.test/free/admin/approve?t=fake-approve';
const notRightPersonUrl =
  'https://yawp.test/free/admin/not-right-person?t=fake-forward';

function expectDesignedAdminEmail(
  designed: ReturnType<typeof buildDesignedAdminApprovalEmail>,
  options: { reminder?: boolean; forwardedByAdminName?: string } = {}
) {
  const atSchool = teacherAtSchool(teacherName, schoolName);
  if (options.forwardedByAdminName) {
    expect(designed.subject).toBe(`Can you approve Yawp! for ${atSchool}?`);
    expect(designed.text).toContain(
      `${options.forwardedByAdminName} forwarded this to you`
    );
  } else if (options.reminder) {
    expect(designed.subject).toBe(
      `Reminder: ${atSchool} would like to use Yawp!`
    );
    expect(designed.text).toContain(
      'This is a reminder about the approval request below.'
    );
  } else {
    expect(designed.subject).toBe(`${atSchool} would like to use Yawp!`);
  }
  expect(designed.text).toContain(`Approve Yawp! for ${atSchool}`);
  expect(designed.text).toContain('Review and approve:');
  expect(designed.text).toContain(approveUrl);
  expect(designed.html).toContain('Review and approve</a>');
  expect(designed.html).toContain(`href="${approveUrl}"`);
  expect(designed.html).toContain(`Approve Yawp! for ${atSchool}`);
}

test('approval v2 delivery uses designed approval email', () => {
  expectDesignedAdminEmail(
    buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
    })
  );
});

test('approval v2 reminder uses designed reminder email', () => {
  expectDesignedAdminEmail(
    buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      reminder: true,
    }),
    { reminder: true }
  );
});

test('approval v2 forward recipient uses designed forward email', () => {
  expectDesignedAdminEmail(
    buildDesignedAdminApprovalEmail({
      teacherName,
      teacherEmail,
      schoolName,
      approveUrl,
      notRightPersonUrl,
      forwardedByAdminName: 'Sam Chen',
    }),
    { forwardedByAdminName: 'Sam Chen' }
  );
});
