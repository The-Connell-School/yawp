import { describe, expect, test } from 'bun:test';
import {
  formatFailedTeacherInviteEmailsForTextarea,
  nextTeacherInviteEmailsAfterResult,
  teacherInvitePartialFailureMessage,
  teacherInviteSuccessMessage,
} from './teacher-invite-copy';

describe('teacher invite copy helpers', () => {
  test('formats success copy for singular and plural sends', () => {
    expect(teacherInviteSuccessMessage(1)).toBe(
      'Invitation sent to 1 teacher.'
    );
    expect(teacherInviteSuccessMessage(3)).toBe(
      'Invitations sent to 3 teachers.'
    );
  });

  test('formats partial failure copy with comma-separated addresses', () => {
    expect(
      teacherInvitePartialFailureMessage([
        'jo@school.org',
        'sam@school.org',
      ])
    ).toBe("We couldn't send to: jo@school.org, sam@school.org. Try again.");
  });

  test('retains only failed addresses in the textarea after partial sends', () => {
    expect(
      nextTeacherInviteEmailsAfterResult({
        currentEmails: 'good@example.test, bad@example.test',
        sentCount: 1,
        failedEmails: ['bad@example.test'],
      })
    ).toBe(formatFailedTeacherInviteEmailsForTextarea(['bad@example.test']));
  });
});
