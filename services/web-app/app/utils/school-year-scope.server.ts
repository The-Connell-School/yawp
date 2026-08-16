import { prisma } from '~/utils/db.server';
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
 * Teachers with classes in the current year land there. Returning teachers
 * who have not yet been attached to a current-year class land on their newest
 * non-archived class year instead of an unexplained empty app.
 *
 * An explicit selection is always honoured, including a future empty year a
 * teacher selected so they can create its first class.
 */
export async function resolveTeacherSchoolYearScope(
  request: Request,
  membershipId: string
) {
  const chosen = await storedScope(request);
  if (chosen) return chosen;

  const current = currentSchoolYear();
  const rows = await prisma.class.findMany({
    where: {
      teachers: { some: { id: membershipId } },
      isArchived: false,
    },
    select: { schoolYear: true },
    distinct: ['schoolYear'],
  });
  const years = rows
    .map((row) => row.schoolYear)
    .filter(isSchoolYear)
    .sort((a, b) => b.localeCompare(a));

  return years.includes(current) ? current : (years[0] ?? current);
}

/** The years this student actually has classes in, newest first. */
async function studentSchoolYears(membershipId: string) {
  const rows = await prisma.class.findMany({
    where: { students: { some: { id: membershipId } }, isArchived: false },
    select: { schoolYear: true },
    distinct: ['schoolYear'],
  });

  return rows
    .map((row) => row.schoolYear)
    .filter(isSchoolYear)
    .sort((a, b) => b.localeCompare(a));
}

/**
 * Students default to the newest year they are actually enrolled in. A
 * student who comes back in September before joining this year's classes
 * should see last year's work, not an empty page they have no way to fix.
 *
 * A stored year the student has no classes in is ignored for the same reason.
 * The cookie is one value for the whole browser, so it can hold a year chosen
 * somewhere else entirely — a teacher planning next year, or this student's own
 * choice from a year they have since left. Honouring it would show a student an
 * empty app with no clue why, which is the one outcome the scope must not
 * produce. An explicit "all years" is always honoured: it can never be empty.
 */
export async function resolveStudentSchoolYearScope(
  request: Request,
  membershipId: string
) {
  const chosen = await storedScope(request);
  if (chosen === ALL_SCHOOL_YEARS) return chosen;

  const years = await studentSchoolYears(membershipId);
  if (chosen && years.includes(chosen)) return chosen;

  return years[0] ?? currentSchoolYear();
}

export async function resolveSchoolYearScopeForMembership(
  request: Request,
  membership: { id: string; role: string }
) {
  return membership.role === 'STUDENT'
    ? resolveStudentSchoolYearScope(request, membership.id)
    : resolveTeacherSchoolYearScope(request, membership.id);
}

/**
 * The years to offer this person, newest first: the ones they have classes in,
 * plus — for teachers — the current year, so a teacher starting a new year can
 * select it before creating anything.
 *
 * A student is offered only the years they have classes in. Offering a year
 * they were never enrolled in would let them select their way into an empty
 * app, and there is nothing there for them to find.
 */
export async function schoolYearsForMembership(membership: {
  id: string;
  role: string;
}) {
  if (membership.role === 'STUDENT') {
    return studentSchoolYears(membership.id);
  }

  const rows = await prisma.class.findMany({
    where: { teachers: { some: { id: membership.id } } },
    select: { schoolYear: true },
    distinct: ['schoolYear'],
  });

  return schoolYearOptions({ years: rows.map((row) => row.schoolYear) });
}
