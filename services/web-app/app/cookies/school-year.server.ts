import { createCookie } from 'react-router';
import { shouldUseSecureCookies } from '~/utils/cookie-security.server';
import {
  ALL_SCHOOL_YEARS,
  currentSchoolYear,
  isSchoolYear,
} from '~/utils/school-year';

/**
 * The school year a teacher is working in. This is app-wide state, not a
 * per-page filter: My Classes, the grading queue and every class picker read
 * the same value, so navigating between them cannot silently change scope.
 */
const cookieName = 'school-year';
const SCHOOL_YEAR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 400;

export const schoolYearCookie = createCookie(cookieName, {
  path: '/',
  httpOnly: true,
  secure: shouldUseSecureCookies(),
  sameSite: 'lax',
});

export type SchoolYearScope = string;

/**
 * Reads the stored scope, falling back to the year we are actually in. An
 * unrecognised value is treated as unset rather than an error — the scope is a
 * view, and a stale cookie should never leave someone staring at nothing.
 */
export async function getSchoolYearScope(
  request: Request
): Promise<SchoolYearScope> {
  const raw = request.headers.get('cookie');
  const stored = raw ? await schoolYearCookie.parse(raw) : null;

  if (stored === ALL_SCHOOL_YEARS) return ALL_SCHOOL_YEARS;
  if (isSchoolYear(stored)) return stored;
  return currentSchoolYear();
}

export function setSchoolYearScope(scope: SchoolYearScope) {
  return schoolYearCookie.serialize(scope, {
    maxAge: SCHOOL_YEAR_COOKIE_MAX_AGE_SECONDS,
  });
}

/** Remove a scope inherited from another signed-in identity. */
export function clearSchoolYearScope() {
  return schoolYearCookie.serialize('', { maxAge: 0 });
}
