/**
 * The library stays on the class the teacher last chose (Brian, Oct 29): a
 * cookie, so the page opens on that class with no flicker, after a reload
 * or on the way back from a lesson.
 */
export const LIBRARY_COURSE_COOKIE = 'yawp_library_course';

export function readLibraryCourse(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name !== LIBRARY_COURSE_COOKIE) continue;
    const value = rest.join('=');
    if (!value) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function libraryCourseCookie(courseId: string): string {
  return `${LIBRARY_COURSE_COOKIE}=${encodeURIComponent(courseId)}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
