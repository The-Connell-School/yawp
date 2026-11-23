import { describe, expect, it } from 'bun:test';
import type { FreeAccountUsage } from './inapp-usage';
import {
  usageMeterLevel,
  usageMeterPercentLeft,
  usageMeterRenewsLabel,
  usageMeterRows,
  usageMeterStatus,
} from './usage-nav-meter';

const count = (used: number, total: number) => ({
  used,
  total,
  remaining: Math.max(0, total - used),
});

function usage(overrides: Partial<FreeAccountUsage> = {}): FreeAccountUsage {
  return {
    students: count(0, 30),
    assignments: [],
    lessonPlans: count(1, 5),
    allAssignmentsUsed: false,
    warning: null,
    monthly: true,
    lessonPlannerMonthlyMetering: true,
    renewsAt: '2026-12-01T00:00:00.000Z',
    reporter: count(0, 2),
    classId: 'c1',
    checklist: {
      classReady: true,
      assignmentCreated: false,
      writingSubmitted: false,
      graded: false,
    },
    gradingPause: null,
    ...overrides,
  } as FreeAccountUsage;
}

describe('usage meter levels', () => {
  it('fills the bar with what is left, not what is used', () => {
    expect(usageMeterPercentLeft(count(1, 5))).toBe(80);
    expect(usageMeterPercentLeft(count(5, 5))).toBe(0);
    expect(usageMeterPercentLeft(count(0, 0))).toBe(0);
  });

  it('uses the three Design words', () => {
    expect(usageMeterLevel(count(0, 5))).toBe('plenty');
    expect(usageMeterLevel(count(4, 5))).toBe('few');
    expect(usageMeterLevel(count(5, 5))).toBe('all-used');
    expect(usageMeterLevel(count(1, 2))).toBe('few');
    expect(usageMeterStatus('plenty')).toBe('Plenty left');
    expect(usageMeterStatus('few')).toBe('A few left');
    expect(usageMeterStatus('all-used')).toBe('All used');
  });

  it('labels the renew date as a short UTC month', () => {
    expect(usageMeterRenewsLabel('2026-12-01T00:00:00.000Z')).toBe(
      'Renews Dec 1'
    );
  });
});

describe('usageMeterRows', () => {
  it('shows Lesson Planner and Reporter when both are available', () => {
    const rows = usageMeterRows(usage(), { lessonPlannerAvailable: true });
    expect(rows.map((r) => [r.label, r.status, r.percentLeft])).toEqual([
      ['Lesson Planner', 'Plenty left', 80],
      ['Reporter', 'Plenty left', 100],
    ]);
  });

  it('drops Lesson Planner when the teacher cannot open it', () => {
    const rows = usageMeterRows(usage(), { lessonPlannerAvailable: false });
    expect(rows.map((r) => r.label)).toEqual(['Reporter']);
  });

  it('hides Reporter while it is locked or before monthly metering', () => {
    expect(
      usageMeterRows(usage({ reporterLocked: true }), {
        lessonPlannerAvailable: false,
      })
    ).toEqual([]);
    expect(
      usageMeterRows(
        usage({ monthly: false, lessonPlannerMonthlyMetering: false }),
        { lessonPlannerAvailable: true }
      )
    ).toEqual([]);
  });
});
