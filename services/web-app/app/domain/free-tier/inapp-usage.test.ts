import { expect, test } from 'bun:test';
import {
  FREE_ASSIGNMENT_LABELS,
  FREE_CLASSROOM_BUNDLE_TILE_LABELS,
  formatUsageRenewsLabel,
  freeAssignmentKindUsageMeta,
  freeClassroomBundlePitchList,
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

test('freeAssignmentKindUsageMeta hides unlimited copy and shows quotas when capped', () => {
  expect(
    freeAssignmentKindUsageMeta(
      { monthly: false, unlimitedFreeAssignmentTiles: true },
      { used: 0, total: 12, remaining: 12 }
    )
  ).toBe('');
  const row = { used: 3, total: 12, remaining: 9 };
  expect(
    freeAssignmentKindUsageMeta(
      { monthly: false, unlimitedFreeAssignmentTiles: false },
      row
    )
  ).toBe('9 of 12 left');
  expect(
    freeAssignmentKindUsageMeta({ monthly: true, unlimitedFreeAssignmentTiles: false }, row)
  ).toBe('');
  expect(
    freeAssignmentKindUsageMeta(
      { monthly: false, unlimitedFreeAssignmentTiles: false },
      { used: 12, total: 12, remaining: 0 }
    )
  ).toBe('None left');
});

test('labels Exit Ticket usage', () => {
  expect(FREE_ASSIGNMENT_LABELS.exit_ticket).toBe('Exit Ticket');
});

test('freeClassroomBundlePitchList names all six bundle kinds for public copy', () => {
  expect(FREE_CLASSROOM_BUNDLE_TILE_LABELS).toHaveLength(6);
  expect(FREE_CLASSROOM_BUNDLE_TILE_LABELS).toContain('CER Paragraph');
  expect(freeClassroomBundlePitchList()).toBe(
    'Class Starter, Exit Ticket, 5-Paragraph Essay, Pre-writing, Thesis Builder, and CER Paragraph'
  );
});
