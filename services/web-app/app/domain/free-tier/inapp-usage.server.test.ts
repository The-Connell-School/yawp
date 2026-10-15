import { test, expect, mock } from 'bun:test';
const classRead = mock(async (..._args: any[]) => ({
  id: 'class',
  code: 'CLASS',
}));
const count = mock(async () => 0);
mock.module('~/utils/db.server', () => ({
  prisma: { class: { findFirst: classRead }, document: { count } },
}));
mock.module('~/utils/assignment-quota.server', () => ({
  getFreeClassroomAssignmentQuotaUsage: async () =>
    new Map([
      ['class_starter', 3],
      ['prewriting', 3],
      ['thesis_statement', 0],
    ]),
}));
mock.module('./class-seat-cap.server', () => ({
  countFreeClassSeatUsage: async () => ({
    currentStudents: 12,
    pendingInvites: 2,
  }),
}));
mock.module('~/utils/lesson-planner/lesson-planner-quota.server', () => ({
  countOrganizationLessonPlans: async () => 2,
}));
mock.module('~/utils/rate-limit.server', () => ({
  readGradingLimitStatus: async () => null,
}));
const { readFreeAccountUsage } = await import('./inapp-usage.server');
test('adapter reads authoritative usage, including invites and lifetime counts', async () => {
  const usage = await readFreeAccountUsage('org', 'teacher');
  expect(usage.students.remaining).toBe(21);
  expect(usage.assignments.map((row) => row.remaining)).toEqual([9, 0, 3]);
  expect(usage.lessonPlans.remaining).toBe(3);
  expect(classRead.mock.calls[0][0].where).toMatchObject({
    school: { organizationId: 'org' },
    teachers: { some: { id: 'teacher' } },
  });
  expect(usage.checklist).toEqual({
    classReady: true,
    assignmentCreated: true,
    writingSubmitted: false,
    graded: false,
  });
});
