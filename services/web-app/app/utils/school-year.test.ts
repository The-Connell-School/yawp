import { describe, expect, test } from 'bun:test';

import {
  ALL_SCHOOL_YEARS,
  currentSchoolYear,
  isSchoolYear,
  resolveSchoolYearScope,
  schoolYearOptions,
  selectableSchoolYears,
} from './school-year';

describe('school year', () => {
  test('rolls over in July', () => {
    expect(currentSchoolYear(new Date('2026-06-30T12:00:00Z'))).toBe('2025-2026');
    expect(currentSchoolYear(new Date('2026-07-01T12:00:00Z'))).toBe('2026-2027');
    expect(currentSchoolYear(new Date('2026-08-11T12:00:00Z'))).toBe('2026-2027');
    expect(currentSchoolYear(new Date('2027-01-15T12:00:00Z'))).toBe('2026-2027');
  });

  test('recognises the stored format only', () => {
    expect(isSchoolYear('2026-2027')).toBe(true);
    expect(isSchoolYear('2026')).toBe(false);
    expect(isSchoolYear('all')).toBe(false);
    expect(isSchoolYear(null)).toBe(false);
  });

  test('resolves the scope, falling back to the current year', () => {
    const now = new Date('2026-08-11T12:00:00Z');

    expect(
      resolveSchoolYearScope('2024-2025', { availableYears: [], now })
    ).toBe('2024-2025');
    expect(
      resolveSchoolYearScope(ALL_SCHOOL_YEARS, { availableYears: [], now })
    ).toBe(ALL_SCHOOL_YEARS);
    expect(resolveSchoolYearScope(null, { availableYears: [], now })).toBe(
      '2026-2027'
    );
    expect(resolveSchoolYearScope('nonsense', { availableYears: [], now })).toBe(
      '2026-2027'
    );
  });

  test('offers two years back through one ahead when creating a class', () => {
    const now = new Date('2026-08-11T12:00:00Z');

    expect(selectableSchoolYears({ now })).toEqual([
      '2027-2028',
      '2026-2027',
      '2025-2026',
      '2024-2025',
    ]);
  });

  test('keeps an existing class year on the list even when it is older', () => {
    const now = new Date('2026-08-11T12:00:00Z');

    expect(selectableSchoolYears({ now, include: '2019-2020' })).toContain(
      '2019-2020'
    );
    expect(selectableSchoolYears({ now, include: 'junk' })).not.toContain(
      'junk'
    );
  });

  test('offers the current year even when the teacher has no classes in it', () => {
    const now = new Date('2026-08-11T12:00:00Z');

    expect(
      schoolYearOptions({ years: ['2024-2025', '2025-2026', 'junk'], now })
    ).toEqual(['2026-2027', '2025-2026', '2024-2025']);
  });
});
