import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findMany = mock(() =>
  Promise.resolve([] as Array<{ schoolYear: string }>)
);

mock.module('~/utils/db.server', () => ({
  prisma: { class: { findMany } },
}));

const {
  resolveTeacherSchoolYearScope,
  resolveStudentSchoolYearScope,
  schoolYearsForMembership,
} = await import('./school-year-scope.server');
const { schoolYearCookie } = await import('~/cookies/school-year.server');
const { currentSchoolYear } = await import('~/utils/school-year');

async function requestWithScope(scope: string | null) {
  if (scope === null) return new Request('https://yawp.test/app');

  const cookie = await schoolYearCookie.serialize(scope);
  return new Request('https://yawp.test/app', {
    headers: { cookie: cookie.split(';')[0] },
  });
}

function enrolledIn(years: string[]) {
  findMany.mockImplementation(() =>
    Promise.resolve(years.map((schoolYear) => ({ schoolYear })))
  );
}

describe('resolveTeacherSchoolYearScope', () => {
  beforeEach(() => {
    findMany.mockClear();
  });

  test('defaults to the current year when the teacher has classes there', async () => {
    const current = currentSchoolYear();
    enrolledIn(['2025-2026', current]);

    expect(
      await resolveTeacherSchoolYearScope(await requestWithScope(null), 'm1')
    ).toBe(current);
  });

  test('falls back to the newest class year instead of an empty current year', async () => {
    enrolledIn(['2024-2025', '2025-2026']);

    expect(
      await resolveTeacherSchoolYearScope(await requestWithScope(null), 'm1')
    ).toBe('2025-2026');
  });

  test('honours a year the teacher explicitly selected', async () => {
    enrolledIn(['2025-2026']);

    expect(
      await resolveTeacherSchoolYearScope(
        await requestWithScope('2026-2027'),
        'm1'
      )
    ).toBe('2026-2027');
    expect(findMany).not.toHaveBeenCalled();
  });

  test('falls back to the current year when the teacher has no classes', async () => {
    enrolledIn([]);

    expect(
      await resolveTeacherSchoolYearScope(await requestWithScope(null), 'm1')
    ).toBe(currentSchoolYear());
  });
});

describe('resolveStudentSchoolYearScope', () => {
  beforeEach(() => {
    findMany.mockClear();
  });

  test('defaults to the newest year the student is enrolled in', async () => {
    enrolledIn(['2024-2025', '2025-2026']);

    expect(
      await resolveStudentSchoolYearScope(await requestWithScope(null), 'm1')
    ).toBe('2025-2026');
  });

  test('honours a stored year the student has classes in', async () => {
    enrolledIn(['2024-2025', '2025-2026']);

    expect(
      await resolveStudentSchoolYearScope(
        await requestWithScope('2024-2025'),
        'm1'
      )
    ).toBe('2024-2025');
  });

  /**
   * The cookie is one value for the whole browser, so it can hold a year the
   * student has nothing in — a teacher looking ahead to next year, or a year
   * this student has since left. Honouring it shows an empty app.
   */
  test('ignores a stored year the student has no classes in', async () => {
    enrolledIn(['2025-2026']);

    expect(
      await resolveStudentSchoolYearScope(
        await requestWithScope('2026-2027'),
        'm1'
      )
    ).toBe('2025-2026');
  });

  test('honours all years, which can never be empty', async () => {
    enrolledIn(['2025-2026']);

    expect(
      await resolveStudentSchoolYearScope(await requestWithScope('all'), 'm1')
    ).toBe('all');
  });

  test('falls back to the current year when the student has no classes', async () => {
    enrolledIn([]);

    const resolved = await resolveStudentSchoolYearScope(
      await requestWithScope('2019-2020'),
      'm1'
    );

    expect(resolved).toMatch(/^\d{4}-\d{4}$/);
    expect(resolved).not.toBe('2019-2020');
  });
});

describe('schoolYearsForMembership', () => {
  beforeEach(() => {
    findMany.mockClear();
  });

  test('offers a student only the years they have classes in', async () => {
    enrolledIn(['2024-2025', '2025-2026']);

    expect(
      await schoolYearsForMembership({ id: 'm1', role: 'STUDENT' })
    ).toEqual(['2025-2026', '2024-2025']);
  });

  test('offers a teacher the current year even with nothing in it', async () => {
    enrolledIn(['2024-2025']);

    const years = await schoolYearsForMembership({ id: 'm1', role: 'TEACHER' });

    expect(years).toContain('2024-2025');
    expect(years.length).toBeGreaterThan(1);
  });
});
