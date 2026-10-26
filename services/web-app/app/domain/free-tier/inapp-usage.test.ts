import { expect, test } from 'bun:test';
import {
  formatUsageRenewsLabel,
  freeAssignmentKindUsageMeta,
  isLessonPlannerMonthlyExhausted,
} from './inapp-usage';

test('formatUsageRenewsLabel uses UTC month and day', () => {
  expect(formatUsageRenewsLabel('2026-11-01T00:00:00.000Z')).toBe(
    'Renews November 1'
  );
});

test('isLessonPlannerMonthlyExhausted uses monthly metering when enabled', () => {
  const base = {
    students: { used: 0, total: 10, remaining: 10 },
    assignments: [],
    lessonPlans: { used: 0, total: 5, remaining: 5 },
    allAssignmentsUsed: false,
    warning: null,
    classId: null,
    checklist: {
      classReady: true,
      assignmentCreated: false,
      writingSubmitted: false,
      graded: false,
    },
    gradingPause: null,
  };
  expect(
    isLessonPlannerMonthlyExhausted({
      ...base,
      monthly: false,
      lessonPlannerMonthlyMetering: true,
      lessonPlannerMonthly: { used: 5, total: 5, remaining: 0 },
    })
  ).toBe(true);
  expect(
    isLessonPlannerMonthlyExhausted({
      ...base,
      monthly: false,
      lessonPlannerMonthlyMetering: false,
      lessonPlans: { used: 5, total: 5, remaining: 0 },
    })
  ).toBe(true);
});

test('freeAssignmentKindUsageMeta never shows N-of-N counters', () => {
  const row = { used: 3, total: 12, remaining: 9 };
  expect(
    freeAssignmentKindUsageMeta(
      { monthly: false, unlimitedFreeAssignmentTiles: false },
      row
    )
  ).toBe('Unlimited');
  expect(
    freeAssignmentKindUsageMeta({ monthly: true, unlimitedFreeAssignmentTiles: false }, row)
  ).toBe('Unlimited');
  expect(
    freeAssignmentKindUsageMeta(
      { monthly: false, unlimitedFreeAssignmentTiles: false },
      { used: 12, total: 12, remaining: 0 }
    )
  ).toBe('None left');
});
