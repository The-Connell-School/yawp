import { describe, expect, test } from 'bun:test';
import {
  buildTeacherClassWhere,
  canManageGrades,
  isGradingOwnDocument,
} from './grading-auth.server';

describe('grading auth helpers', () => {
  test('builds document class filters for current and legacy submissions', () => {
    expect(
      buildTeacherClassWhere({
        profileId: 'teacher-profile-1',
        isTeacher: true,
        isAdmin: false,
      })
    ).toEqual({
      OR: [
        {
          assignment: {
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
        isTeacher: false,
        isAdmin: true,
      })
    ).toEqual({});
  });

  test('allows teachers and admins to manage grades', () => {
    expect(
      canManageGrades({
        profileId: 'teacher-profile-1',
        isTeacher: true,
        isAdmin: false,
      })
    ).toBe(true);
    expect(
      canManageGrades({
        profileId: 'admin-profile-1',
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
