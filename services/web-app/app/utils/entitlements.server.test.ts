import { describe, expect, test } from 'bun:test';
import type { OrganizationPlan } from '@app/prisma';
import {
  FREE_CLASSROOM_ACTIVE_CLASS_CAP,
  FREE_CLASSROOM_ASSIGNMENT_QUOTAS,
  FREE_CLASSROOM_LESSON_PLAN_QUOTA,
  FREE_CLASSROOM_STUDENT_SEAT_CAP,
  FREE_CLASSROOM_TEACHER_SEAT_CAP,
  canCreateAssignmentOfKindForPlan,
  getEntitlements,
  getEntitlementsForPlan,
} from './entitlements.server';

function plans(): OrganizationPlan[] {
  return ['SCHOOL', 'FREE_CLASSROOM', 'FOUNDING_FACULTY', 'CLASSROOM_LICENSE'];
}

describe('entitlements: shape and caps', () => {
  test('FREE_CLASSROOM caps and feature gates', () => {
    const e = getEntitlementsForPlan('FREE_CLASSROOM');
    expect(e.studentSeatCap).toBe(FREE_CLASSROOM_STUDENT_SEAT_CAP);
    expect(e.teacherSeatCap).toBe(FREE_CLASSROOM_TEACHER_SEAT_CAP);
    expect(e.activeClassCap).toBe(FREE_CLASSROOM_ACTIVE_CLASS_CAP);
    expect(e.features.reporter).toBe(false);
    expect(e.features.classInsights).toBe(true);
    expect(e.features.lessonPlanQuota).toBe(FREE_CLASSROOM_LESSON_PLAN_QUOTA);
    expect(e.canAddStudent({ currentStudents: 34 })).toBe(true);
    expect(e.canAddStudent({ currentStudents: 35 })).toBe(false);
    expect(e.canCreateClass({ currentActiveClasses: 0 })).toBe(true);
    expect(e.canCreateClass({ currentActiveClasses: 1 })).toBe(false);
    expect(e.assignmentQuotaForKind('class_starter')).toBe(
      FREE_CLASSROOM_ASSIGNMENT_QUOTAS.class_starter
    );
    expect(e.canCreateAssignmentOfKind({ kind: 'class_starter', createdCount: 11 })).toBe(
      true
    );
    expect(e.canCreateAssignmentOfKind({ kind: 'class_starter', createdCount: 12 })).toBe(
      false
    );
    expect(e.canCreateAssignmentOfKind({ kind: 'daily_pages', createdCount: 0 })).toBe(
      false
    );
  });

  test('SCHOOL short-circuits assignment quotas without extra work', () => {
    expect(
      canCreateAssignmentOfKindForPlan('SCHOOL', {
        kind: 'class_starter',
        createdCount: 999,
      })
    ).toBe(true);
    expect(getEntitlementsForPlan('SCHOOL').assignmentQuotaForKind('class_starter')).toBeNull();
  });

  test('SCHOOL short-circuits to current behavior (no caps)', () => {
    const e = getEntitlementsForPlan('SCHOOL');
    expect(e.studentSeatCap).toBeNull();
    expect(e.teacherSeatCap).toBeNull();
    expect(e.activeClassCap).toBeNull();
    expect(e.features.reporter).toBe(true);
    expect(e.features.classInsights).toBe(true);
    expect(e.features.lessonPlanQuota).toBeNull();
    // Predicates always allow for SCHOOL.
    expect(e.canAddStudent({ currentStudents: 1000 })).toBe(true);
    expect(e.canCreateClass({ currentActiveClasses: 1000 })).toBe(true);
  });
});

describe('entitlements: direct plan or organization object', () => {
  test('accepts either a plan string or an organization-like object', () => {
    for (const plan of plans()) {
      const viaPlan = getEntitlements(plan);
      const viaOrg = getEntitlements({ plan } as any);
      expect(viaOrg.plan).toBe(viaPlan.plan);
      expect(viaOrg.features.reporter).toBe(viaPlan.features.reporter);
    }
  });
});

