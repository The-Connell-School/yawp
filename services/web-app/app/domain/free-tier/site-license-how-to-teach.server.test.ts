import { beforeEach, describe, expect, mock, test } from 'bun:test';

const findFirst = mock();
mock.module('~/utils/db.server', () => ({
  prisma: { assignmentType: { findFirst } },
}));

const requireUserId = mock();
const requireMembership = mock();
mock.module('~/utils/auth.server', () => ({ requireUserId, requireMembership }));

const { isAssignmentTypeHowToTeachLockedForTeacher, shouldBlockSiteLicenseCourseAsset } =
  await import('./site-license-how-to-teach.server');

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

describe('shouldBlockSiteLicenseCourseAsset', () => {
  const courseFile = (path: string) =>
    new Request(`https://yawp.school/courses/thesis-driven-essay/${path}`);

  function signedInAs(plan: 'FREE_CLASSROOM' | 'SCHOOL') {
    requireUserId.mockResolvedValue('user-1');
    requireMembership.mockResolvedValue({
      role: 'TEACHER',
      organization: { plan },
    });
  }

  test('blocks signed-out requests', async () => {
    requireUserId.mockRejectedValue(new Error('signed out'));
    expect(
      await shouldBlockSiteLicenseCourseAsset(courseFile('02-pre-writing.pptx'))
    ).toBe(true);
  });

  test('lets free teachers fetch the Pre-writing and Thesis Statement files', async () => {
    signedInAs('FREE_CLASSROOM');
    for (const path of [
      '02-pre-writing.pptx',
      '02-lesson-plan-pre-writing.pdf',
      'tutorials/02-pre-writing.mp4',
      'tutorials/02-pre-writing.jpg',
      'tutorials/02-pre-writing.vtt',
      '03-develop-your-thesis-statement.pptx',
      '03-lesson-plan-thesis-statement.pdf',
      'tutorials/03-thesis-statement.mp4',
    ]) {
      expect(await shouldBlockSiteLicenseCourseAsset(courseFile(path))).toBe(false);
    }
  });

  test('keeps the other course files site-license only for free teachers', async () => {
    signedInAs('FREE_CLASSROOM');
    for (const path of [
      '01-introduction-to-yawp.pptx',
      '04-introduction-paragraph.pptx',
      'tutorials/05-body-paragraphs.mp4',
    ]) {
      expect(await shouldBlockSiteLicenseCourseAsset(courseFile(path))).toBe(true);
    }
  });

  test('never blocks paid teachers', async () => {
    signedInAs('SCHOOL');
    expect(
      await shouldBlockSiteLicenseCourseAsset(
        courseFile('04-introduction-paragraph.pptx')
      )
    ).toBe(false);
  });
});
