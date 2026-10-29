import { describe, expect, test } from 'bun:test';

import { redirectIfTeacherLoungeTemporarilyDisabled } from './teacher-lounge-temporary-disable.server';

describe('redirectIfTeacherLoungeTemporarilyDisabled', () => {
  test('redirects to the teacher dashboard while the Lounge is disabled', () => {
    try {
      redirectIfTeacherLoungeTemporarilyDisabled();
      expect.unreachable('expected redirect');
    } catch (response) {
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).status).toBe(302);
      expect((response as Response).headers.get('Location')).toBe('/app');
    }
  });
});
