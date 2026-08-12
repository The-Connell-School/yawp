import { prisma } from '~/utils/db.server';
import { getSchoolYearScope } from '~/cookies/school-year.server';
import {
  ALL_SCHOOL_YEARS,
  currentSchoolYear,
  isSchoolYear,
  schoolYearOptions,
} from '~/utils/school-year';

/**
 * One school year scopes the whole app for one person. Teachers pick it in
 * Settings; students get the year their work is actually in without being
 * asked. Both are stored in the same cookie, so a student who does go looking
 * for last year gets the same behaviour a teacher does.
 *
 * The scope is a *view*. Nothing is archived to make a year end, so a class
 * outside the scope is hidden from a list, never lost.
 */

/** Turns a scope into the `where` fragment every class query can spread. */
export function schoolYearWhere(scope: string) {
  return scope === ALL_SCHOOL_YEARS ? {} : { schoolYear: scope };
}

async function storedScope(request: Request) {
  const raw = request.headers.get('cookie');
  if (!raw) return null;

  const { schoolYearCookie } = await import('~/cookies/school-year.server');
  const stored = await schoolYearCookie.parse(raw);

  if (stored === ALL_SCHOOL_YEARS) return ALL_SCHOOL_YEARS;
  return isSchoolYear(stored) ? stored : null;
}

/**
 * Teachers default to the year we are *in*, not the year they last taught —
 * a returning teacher opening the app in August should see a clean slate for
 * the year about to start, which is the whole point of the scope.
 */
export async function resolveTeacherSchoolYearScope(request: Request) {
  return getSchoolYearScope(request);
}

/**
 * Students default to the newest year they are actually enrolled in. A
 * student who comes back in September before joining this year's classes
 * should see last year's work, not an empty page they have no way to fix.
 */
export async function resolveStudentSchoolYearScope(
  request: Request,
  membershipId: string
) {
  const chosen = await storedScope(request);
  if (chosen) return chosen;

  const latest = await prisma.class.findFirst({
    where: { students: { some: { id: membershipId } }, isArchived: false },
    select: { schoolYear: true },
    orderBy: { schoolYear: 'desc' },
  });

  return latest?.schoolYear ?? currentSchoolYear();
}

export async function resolveSchoolYearScopeForMembership(
  request: Request,
  membership: { id: string; role: string }
) {
  return membership.role === 'STUDENT'
    ? resolveStudentSchoolYearScope(request, membership.id)
    : resolveTeacherSchoolYearScope(request);
}

/**
 * The years to offer this person, newest first: the ones they have classes in,
 * plus — for teachers — the current year, so a teacher starting a new year can
 * select it before creating anything.
 */
export async function schoolYearsForMembership(membership: {
  id: string;
  role: string;
}) {
  const isStudent = membership.role === 'STUDENT';

  const rows = await prisma.class.findMany({
    where: isStudent
      ? { students: { some: { id: membership.id } }, isArchived: false }
      : { teachers: { some: { id: membership.id } } },
    select: { schoolYear: true },
    distinct: ['schoolYear'],
  });

  const years = rows.map((row) => row.schoolYear);

  if (isStudent) {
    return years.filter(isSchoolYear).sort((a, b) => b.localeCompare(a));
  }

  return schoolYearOptions({ years });
}
