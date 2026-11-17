import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findFirst = mock();
mock.module('~/utils/db.server', () => ({
  prisma: { assignmentType: { findFirst } },
}));

const requireUserId = mock();
const requireMembership = mock();
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { isAssignmentTypeHowToTeachLockedForTeacher } = await import(
  './site-license-how-to-teach.server'
);

beforeEach(() => {
  findFirst.mockReset();
  requireUserId.mockReset();
  requireMembership.mockReset();
});

describe('isAssignmentTypeHowToTeachLockedForTeacher', () => {
  test('is false for paid orgs', async () => {
    expect(
      await isAssignmentTypeHowToTeachLockedForTeacher({
        organizationPlan: 'SCHOOL',
        assignmentTypeId: 'tde',
      })
    ).toBe(false);
    expect(findFirst).not.toHaveBeenCalled();
  });

  test('is true for free orgs on a site-license tile type', async () => {
    findFirst.mockResolvedValue({
      title: 'The Thesis-Driven Essay',
      kind: null,
      systemKey: null,
      ownerOrgId: null,
      ownerMembershipId: null,
    });
    expect(
      await isAssignmentTypeHowToTeachLockedForTeacher({
        organizationPlan: 'FREE_CLASSROOM',
        assignmentTypeId: 'tde',
      })
    ).toBe(true);
  });
});