import { describe, expect, mock, test } from 'bun:test';

mock.module('~/utils/auth.server', () => ({
  requireAdmin: mock(),
  requireMembership: mock(),
  requireUserId: mock(),
}));
mock.module('~/utils/db.server', () => ({ prisma: {} }));

const { buildTeacherClassWhere, canManageGrades, isGradingOwnDocument } =
  await import('./grading-auth.server');

describe('grading auth helpers', () => {
  test('builds document class filters for current and legacy submissions', () => {
    expect(
      buildTeacherClassWhere({
        membershipId: 'teacher-membership-1',
        organizationId: 'org-1',
        teacherProfileId: 'teacher-1',
        isTeacher: true,
        isAdmin: false,
      })
    ).toEqual({
      membership: { organizationId: 'org-1' },
      OR: [
        {
          classAssignment: {
            class: {
              school: { organizationId: 'org-1' },
              teachers: {
                some: {
                  id: 'teacher-membership-1',
                },
              },
            },
          },
        },
        {
          membership: {
            classesAsStudent: {
              some: {
                school: { organizationId: 'org-1' },
                teachers: {
                  some: {
                    id: 'teacher-membership-1',
                  },
                },
              },
            },
          },
        },
      ],
    });
  });

  test('does not add class filtering for admins', () => {
    expect(
      buildTeacherClassWhere({
        membershipId: 'admin-membership-1',
        organizationId: 'org-1',
        teacherProfileId: null,
        isTeacher: false,
        isAdmin: true,
      })
    ).toEqual({});
  });

  test('allows teachers and admins to manage grades', () => {
    expect(
      canManageGrades({
        membershipId: 'teacher-membership-1',
        organizationId: 'org-1',
        teacherProfileId: 'teacher-1',
        isTeacher: true,
        isAdmin: false,
      })
    ).toBe(true);
    expect(
      canManageGrades({
        membershipId: 'admin-membership-1',
        organizationId: 'org-1',
        teacherProfileId: null,
        isTeacher: false,
        isAdmin: true,
      })
    ).toBe(true);
  });

  test('prevents grading own document', () => {
    expect(isGradingOwnDocument('membership-1', 'membership-1')).toBe(true);
    expect(isGradingOwnDocument('membership-1', 'membership-2')).toBe(false);
  });
});
