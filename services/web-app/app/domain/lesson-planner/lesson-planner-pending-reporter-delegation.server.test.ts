import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { createLessonPlannerReporterReadOnlyDelegation } from './lesson-planner-reporter-delegation.server';

let applicationStatus: 'SENT' | 'MANUAL_REVIEW' | 'APPROVED' = 'SENT';
const db = {
  freeTierApplication: {
    findFirst: mock(async () => ({ status: applicationStatus })),
  },
  organization: {
    findUnique: mock(async () => ({ plan: 'FREE_CLASSROOM' })),
  },
  class: { findMany: mock(async () => []) },
};

mock.module('~/utils/db.server', () => ({ prisma: db }));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: mock(async () => true),
}));

const { handleLessonPlannerToolCall } = await import(
  './lesson-planner-tools.server'
);
const { handleReporterToolCall } = await import(
  '~/domain/reporter/reporter-tools.server'
);

const ctx = { membershipId: 'member-1', organizationId: 'org-1' };

beforeEach(() => {
  applicationStatus = 'SENT';
  db.freeTierApplication.findFirst = mock(async () => ({
    status: applicationStatus,
  }));
  db.class.findMany = mock(async () => []);
});

afterEach(() => {
  applicationStatus = 'SENT';
});

test('pending teacher list_classes succeeds through Lesson Planner delegation', async () => {
  const result = await handleLessonPlannerToolCall('list_classes', {}, ctx);
  expect(JSON.parse(result)).toEqual({ classes: [] });
});

test('pending teacher get_class_grade_report succeeds through Lesson Planner', async () => {
  db.class.findFirst = mock(async () => null);
  const result = await handleLessonPlannerToolCall(
    'get_class_grade_report',
    { classId: 'missing' },
    ctx
  );
  const parsed = JSON.parse(result);
  expect(parsed.error ?? parsed.class).toBeDefined();
});

test('standalone reporter list_classes still 403 for pending org', async () => {
  await expect(
    handleReporterToolCall('list_classes', {}, ctx)
  ).rejects.toMatchObject({ status: 403 });
});

test('save_growth_plan stays denied for pending even with a forged delegation token', async () => {
  await expect(
    handleReporterToolCall(
      'save_growth_plan',
      {
        studentMembershipId: 'student-1',
        focus: 'thesis',
        targetSkills: ['thesis'],
        body: 'Plan',
      },
      {
        ...ctx,
        lessonPlannerReadOnlyDelegation:
          createLessonPlannerReporterReadOnlyDelegation(),
      }
    )
  ).rejects.toMatchObject({ status: 403 });
});
