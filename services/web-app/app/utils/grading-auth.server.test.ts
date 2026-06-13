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
        profileId: 'teacher-profile-1',
        teacherProfileId: 'teacher-1',
        isTeacher: true,
        isAdmin: false,
      })
    ).toEqual({
      OR: [
        {
          classAssignment: {
            class: {
              teachers: {
                some: {
                  profileId: 'teacher-profile-1',
                },
              },
            },
          },
        },
        {
          studentProfile: {
            classes: {
              some: {
                teachers: {
                  some: {
                    profileId: 'teacher-profile-1',
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
        profileId: 'admin-profile-1',
        teacherProfileId: null,
        isTeacher: false,
        isAdmin: true,
      })
    ).toEqual({});
  });

  test('allows teachers and admins to manage grades', () => {
    expect(
      canManageGrades({
        profileId: 'teacher-profile-1',
        teacherProfileId: 'teacher-1',
        isTeacher: true,
        isAdmin: false,
      })
    ).toBe(true);
    expect(
      canManageGrades({
        profileId: 'admin-profile-1',
        teacherProfileId: null,
        isTeacher: false,
        isAdmin: true,
      })
    ).toBe(true);
  });

  test('prevents grading own document', () => {
    expect(isGradingOwnDocument('profile-1', 'profile-1')).toBe(true);
    expect(isGradingOwnDocument('profile-1', 'profile-2')).toBe(false);
  });
});
