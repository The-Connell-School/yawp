import { describe, expect, test } from 'bun:test';
import type { FreeAccountUsage } from '~/domain/free-tier/inapp-usage';
import { freeTierLessonPlannerNavTease } from './free-tier-nav-usage';

function usage(
  overrides: Partial<FreeAccountUsage> = {}
): FreeAccountUsage {
  return {
    students: { used: 0, total: 35, remaining: 35 },
    assignments: [],
    lessonPlans: { used: 0, total: 5, remaining: 5 },
    allAssignmentsUsed: false,
    warning: null,
    monthly: true,
    lessonPlannerMonthlyMetering: true,
    usageNavMetersAvailable: true,
    renewsAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('freeTierLessonPlannerNavTease', () => {
  test('is on for locked preview (reporterLocked or teaching shell locked)', () => {
    expect(freeTierLessonPlannerNavTease(usage({ reporterLocked: true }), false)).toBe(
      true
    );
    expect(freeTierLessonPlannerNavTease(usage(), true)).toBe(true);
  });

  test('is off for approved monthly shell without locked preview', () => {
    expect(
      freeTierLessonPlannerNavTease(
        usage({ reporterLocked: false, monthly: true, lessonPlannerMonthlyMetering: true }),
        false
      )
    ).toBe(false);
  });
});
