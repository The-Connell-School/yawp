import { describe, expect, test } from 'bun:test';
import {
  buildSanitizedIdentityPlan,
  buildTeacherReferencePlan,
} from './sanitize-preview-production-data';

describe('buildSanitizedIdentityPlan', () => {
  test('keeps ids while replacing every user name and email deterministically', () => {
    const plan = buildSanitizedIdentityPlan(
      [
        {
          id: 'user-student-b',
          isAdmin: false,
          memberships: [{ organizationId: 'default-org', role: 'STUDENT' }],
        },
        {
          id: 'user-teacher-b',
          isAdmin: false,
          memberships: [{ organizationId: 'other-org', role: 'TEACHER' }],
        },
        {
          id: 'user-admin-a',
          isAdmin: true,
          memberships: [{ organizationId: 'default-org', role: 'TEACHER' }],
        },
        {
          id: 'user-teacher-a',
          isAdmin: false,
          memberships: [{ organizationId: 'default-org', role: 'TEACHER' }],
        },
        {
          id: 'user-student-a',
          isAdmin: false,
          memberships: [{ organizationId: 'other-org', role: 'STUDENT' }],
        },
      ],
      'default-org'
    );

    expect(plan).toEqual([
      {
        id: 'user-admin-a',
        name: 'Admin 0001',
        email: 'dev.admin@yawp.local',
      },
      {
        id: 'user-student-a',
        name: 'Student 0001',
        email: 'preview-student-0001@example.test',
      },
      {
        id: 'user-student-b',
        name: 'Student 0002',
        email: 'dev.student@yawp.local',
      },
      {
        id: 'user-teacher-a',
        name: 'Teacher 0001',
        email: 'dev.teacher@yawp.local',
      },
      {
        id: 'user-teacher-b',
        name: 'Teacher 0002',
        email: 'preview-teacher-0002@example.test',
      },
    ]);
    expect(plan.map(({ id }) => id).sort()).toEqual([
      'user-admin-a',
      'user-student-a',
      'user-student-b',
      'user-teacher-a',
      'user-teacher-b',
    ]);
  });

  test('fails when the selected preview organization has no teacher or student', () => {
    expect(() =>
      buildSanitizedIdentityPlan(
        [
          {
            id: 'teacher',
            isAdmin: false,
            memberships: [{ organizationId: 'other-org', role: 'TEACHER' }],
          },
        ],
        'default-org'
      )
    ).toThrow('default-org must contain at least one teacher and one student');
  });
});

describe('buildTeacherReferencePlan', () => {
  test('preserves equality while replacing legacy teacher names', () => {
    expect(
      buildTeacherReferencePlan([
        'Jane Smith',
        null,
        'Alice Jones',
        'Jane Smith',
        ' Jane Smith ',
      ])
    ).toEqual([
      { original: 'Alice Jones', replacement: 'Teacher Reference 0001' },
      { original: ' Jane Smith ', replacement: 'Teacher Reference 0002' },
      { original: 'Jane Smith', replacement: 'Teacher Reference 0002' },
    ]);
  });
});
