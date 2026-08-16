/**
 * School years are stored on `Class.schoolYear` as `YYYY-YYYY` and are the
 * scope teachers work in: a returning teacher wants this year's classes, not
 * every class they have ever taught. Students are deliberately not scoped this
 * way — their old work stays reachable.
 */

export const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/;

/** The sentinel a teacher picks to drop the year scope entirely. */
export const ALL_SCHOOL_YEARS = 'all';

/**
 * The school year a date falls in, rolling over in July so that a class
 * created during summer prep belongs to the year that is about to start.
 */
export function currentSchoolYear(now: Date = new Date()) {
  const year = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
}

export function isSchoolYear(value: unknown): value is string {
  return typeof value === 'string' && SCHOOL_YEAR_PATTERN.test(value);
}

/**
 * Resolves the year a teacher is looking at. An unrecognised value falls back
 * to the current year rather than erroring — the selector is a view, and a bad
 * URL should not be a dead end.
 */
export function resolveSchoolYearScope(
  requested: string | null | undefined,
  options: { availableYears: string[]; now?: Date }
) {
  if (requested === ALL_SCHOOL_YEARS) return ALL_SCHOOL_YEARS;
  if (isSchoolYear(requested)) return requested;
  return currentSchoolYear(options.now);
}

/**
 * The years a class may be created in: the two behind, the current one, and
 * the one ahead. `include` keeps an existing class's own year on the list even
 * when it falls outside that window, so opening an old class to edit its title
 * cannot quietly move it to a different year.
 */
export function selectableSchoolYears(params?: {
  now?: Date;
  include?: string | null;
}): string[] {
  const current = currentSchoolYear(params?.now);
  const startYear = Number(current.slice(0, 4));

  const years = new Set(
    [-2, -1, 0, 1].map((offset) => {
      const start = startYear + offset;
      return `${start}-${start + 1}`;
    })
  );

  if (isSchoolYear(params?.include)) years.add(params.include);

  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

/** Years to offer in the selector: everything the teacher has, newest first. */
export function schoolYearOptions(params: {
  years: string[];
  now?: Date;
}): string[] {
  const years = new Set(params.years.filter(isSchoolYear));
  years.add(currentSchoolYear(params.now));
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}
