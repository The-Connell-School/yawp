import { describe, expect, test } from 'bun:test';
import { LIBRARY_COURSE_COOKIE, libraryCourseCookie, readLibraryCourse } from './library-course';

describe('the library remembers the last class (Brian, Oct 29)', () => {
  test('reads the last class from the cookie header', () => {
    expect(readLibraryCourse(`a=1; ${LIBRARY_COURSE_COOKIE}=course_123; b=2`)).toBe('course_123');
    expect(readLibraryCourse(`${LIBRARY_COURSE_COOKIE}=${encodeURIComponent('my lessons')}`)).toBe('my lessons');
  });

  test('nothing remembered: null', () => {
    expect(readLibraryCourse(null)).toBeNull();
    expect(readLibraryCourse('a=1')).toBeNull();
    expect(readLibraryCourse(`${LIBRARY_COURSE_COOKIE}=`)).toBeNull();
  });

  test('the cookie lasts a year, for the whole app, and is never sent cross-site', () => {
    const cookie = libraryCourseCookie('course_123');
    expect(cookie).toContain(`${LIBRARY_COURSE_COOKIE}=course_123`);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('Max-Age=31536000');
    expect(cookie).toContain('SameSite=Lax');
  });
});
