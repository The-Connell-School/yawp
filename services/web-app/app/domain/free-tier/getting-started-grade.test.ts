import { expect, test } from 'bun:test';
import {
  FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF,
  freeTierShowAdvocatePack,
  freeTierShowGettingStartedChecklist,
  resolveFreeTierGradeStepHref,
  teacherCompletedGettingStartedGrade,
} from './getting-started-grade';

test('teacherCompletedGettingStartedGrade is false without this teacher as grader', () => {
  expect(
    teacherCompletedGettingStartedGrade(
      {
        gradedByMembershipId: 'other-teacher',
        releasedAt: new Date('2026-01-02'),
        gradedAt: new Date('2026-01-01'),
        numericPercentage: 90,
      },
      'teacher-1'
    )
  ).toBe(false);
});

test('teacherCompletedGettingStartedGrade is true after this teacher releases a grade', () => {
  expect(
    teacherCompletedGettingStartedGrade(
      {
        gradedByMembershipId: 'teacher-1',
        releasedAt: new Date('2026-01-02'),
        gradedAt: new Date('2026-01-01'),
        numericPercentage: 90,
      },
      'teacher-1'
    )
  ).toBe(true);
});

test('teacherCompletedGettingStartedGrade is true after this teacher saves a meaningful grade', () => {
  expect(
    teacherCompletedGettingStartedGrade(
      {
        gradedByMembershipId: 'teacher-1',
        releasedAt: null,
        gradedAt: new Date('2026-01-01'),
        numericPercentage: 88,
      },
      'teacher-1'
    )
  ).toBe(true);
});

test('teacherCompletedGettingStartedGrade is false for unsubmitted work with only gradedAt', () => {
  expect(
    teacherCompletedGettingStartedGrade(
      {
        gradedByMembershipId: 'teacher-1',
        releasedAt: null,
        gradedAt: new Date('2026-01-01'),
        numericPercentage: null,
        score: null,
        feedback: null,
        overallComment: null,
        letterGrade: null,
        rubricScores: null,
      },
      'teacher-1'
    )
  ).toBe(false);
});

test('resolveFreeTierGradeStepHref deep-links to the first needs-grading submission', () => {
  expect(
    resolveFreeTierGradeStepHref({
      firstNeedsGradingSubmissionId: 'sub-42',
    })
  ).toBe(
    `/app/submissions/sub-42?edit=1&exitTo=${encodeURIComponent(
      FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF
    )}`
  );
});

test('resolveFreeTierGradeStepHref falls back to the needs-grading documents list', () => {
  expect(
    resolveFreeTierGradeStepHref({ firstNeedsGradingSubmissionId: null })
  ).toBe(FREE_TIER_NEEDS_GRADING_DOCUMENTS_HREF);
});

test('free tier advocate rail waits for graded checklist completion', () => {
  expect(
    freeTierShowAdvocatePack({
      monthly: true,
      checklist: { graded: false },
    })
  ).toBe(false);
  expect(
    freeTierShowGettingStartedChecklist({
      monthly: true,
      checklist: { graded: false },
    })
  ).toBe(true);
  expect(
    freeTierShowAdvocatePack({
      monthly: true,
      checklist: { graded: true },
    })
  ).toBe(true);
  expect(
    freeTierShowGettingStartedChecklist({
      monthly: true,
      checklist: { graded: true },
    })
  ).toBe(false);
});
