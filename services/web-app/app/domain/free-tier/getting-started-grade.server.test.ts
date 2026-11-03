import { expect, mock, test } from 'bun:test';
import { readFreeTierGettingStartedGradeProgress } from './getting-started-grade.server';

test('readFreeTierGettingStartedGradeProgress omits invalid submittedAt filter on Submission', async () => {
  const findFirst = mock(() => Promise.resolve(null));
  await readFreeTierGettingStartedGradeProgress(
    { submission: { findFirst } },
    { classId: 'class-1', membershipId: 'teacher-1' }
  );

  expect(findFirst).toHaveBeenCalledTimes(2);
  const needsGradingCall = findFirst.mock.calls[1]?.[0] as {
    where: Record<string, unknown>;
  };
  expect(needsGradingCall.where.unsubmittedAt).toBe(null);
  expect(needsGradingCall.where).not.toHaveProperty('submittedAt');
});
