import { describe, expect, test } from 'bun:test';

import {
  classIdentityMatches,
  isLegacyClassPeriodUniqueViolation,
  normalizeClassIdentityField,
} from './class-identity.server';

describe('normalizeClassIdentityField', () => {
  test('trims and collapses blank values to null', () => {
    expect(normalizeClassIdentityField('  3rd  ')).toBe('3rd');
    expect(normalizeClassIdentityField('')).toBeNull();
    expect(normalizeClassIdentityField(null)).toBeNull();
  });
});

describe('classIdentityMatches', () => {
  const base = {
    schoolId: 'school-1',
    schoolYear: '2026-2027',
    grade: '11',
    period: '3',
    title: 'Theology III',
  };

  test('matches when identity fields align across years only when school year matches', () => {
    expect(classIdentityMatches(base, { ...base })).toBe(true);
    expect(
      classIdentityMatches(base, { ...base, schoolYear: '2025-2026' })
    ).toBe(false);
  });

  test('ignores whitespace differences in optional fields', () => {
    expect(
      classIdentityMatches(base, {
        ...base,
        title: '  Theology III ',
        period: '3',
      })
    ).toBe(true);
  });
});

describe('isLegacyClassPeriodUniqueViolation', () => {
  test('detects legacy index names and period-grade targets', () => {
    expect(
      isLegacyClassPeriodUniqueViolation({
        code: 'P2002',
        meta: { target: ['schoolId', 'schoolYear', 'period', 'grade'] },
      })
    ).toBe(true);
    expect(
      isLegacyClassPeriodUniqueViolation({
        code: 'P2002',
        meta: { target: ['schoolId', 'code'] },
      })
    ).toBe(false);
  });
});
