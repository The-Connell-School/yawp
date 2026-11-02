import { describe, expect, test } from 'bun:test';

import { TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS } from './teacher-lounge-temporary-disable';
import { redirectIfTeacherLoungeTemporarilyDisabled } from './teacher-lounge-temporary-disable.server';

describe('redirectIfTeacherLoungeTemporarilyDisabled', () => {
  test('redirects non-allowlisted teachers to the dashboard', () => {
    try {
      redirectIfTeacherLoungeTemporarilyDisabled({
        email: 'other.teacher@example.com',
      });
      expect.unreachable('expected redirect');
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('Location')).toBe('/app');
    }
  });

  test('does not redirect allowlisted Montgomery teacher', () => {
    expect(() =>
      redirectIfTeacherLoungeTemporarilyDisabled({
        email: TEACHER_LOUNGE_DISABLE_ALLOWLIST_EMAILS[0],
      })
    ).not.toThrow();
  });
});
