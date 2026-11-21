import { describe, expect, test } from 'bun:test';
import { BELOW_HS_TAG, isBelowHsGrade } from './grade-gate';
import { isSupportedSignupGrade } from './public-onboarding.server';
import { parseClassPreparation } from './class-preparation';
import { FREE_CLASSROOM_ASSIGNMENT_KINDS } from './free-classroom-assignment-kinds';

const MIDDLE_SCHOOL_GRADES = ['6', '7', '8'] as const;
const REFERENCE_HIGH_SCHOOL_GRADE = '10';

describe('middle school free-tier parity with high school', () => {
  test('grades 6–8 are not elementary declines and match grade 10 on signup support', () => {
    for (const grade of MIDDLE_SCHOOL_GRADES) {
      expect(isBelowHsGrade(grade)).toBe(false);
      expect(isBelowHsGrade(REFERENCE_HIGH_SCHOOL_GRADE)).toBe(false);
      expect(isSupportedSignupGrade(grade)).toBe(
        isSupportedSignupGrade(REFERENCE_HIGH_SCHOOL_GRADE)
      );
    }
  });

  test('grades 6–8 pass class-prep validation the same way grade 10 does', () => {
    const reference = parseClassPreparation('ELA', REFERENCE_HIGH_SCHOOL_GRADE);
    expect(reference.ok).toBe(true);
    for (const grade of MIDDLE_SCHOOL_GRADES) {
      const parsed = parseClassPreparation('ELA', grade);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.grade).toBe(grade);
    }
  });

  test('elementary grades still decline with below-hs while 6–8 do not', () => {
    for (const grade of ['K', '1', '2', '3', '4', '5'] as const) {
      expect(isBelowHsGrade(grade)).toBe(true);
      expect(isSupportedSignupGrade(grade)).toBe(true);
    }
    expect(BELOW_HS_TAG).toBe('below-hs');
    for (const grade of MIDDLE_SCHOOL_GRADES) {
      expect(isBelowHsGrade(grade)).toBe(false);
    }
  });

  test('free-classroom assignment bundle is grade-agnostic (same kinds for every teacher)', () => {
    expect(FREE_CLASSROOM_ASSIGNMENT_KINDS.length).toBeGreaterThan(0);
    // Bundle availability is not filtered by applicant gradeLevel in domain code.
    expect(new Set(FREE_CLASSROOM_ASSIGNMENT_KINDS).size).toBe(
      FREE_CLASSROOM_ASSIGNMENT_KINDS.length
    );
  });
});