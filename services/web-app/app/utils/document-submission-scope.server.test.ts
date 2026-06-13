import { describe, expect, test } from 'bun:test';

import {
  getDocumentSubmissionSchoolIds,
  getDocumentSubmissionScope,
} from './document-submission-scope.server';

describe('getDocumentSubmissionSchoolIds', () => {
  test('uses the class assignment class school for assignment-backed documents', () => {
    expect(
      getDocumentSubmissionSchoolIds({
        classAssignment: { class: { schoolId: 'assignment-school' } },
        membership: {
          classesAsStudent: [{ schoolId: 'student-school' }],
        },
      })
    ).toEqual(['assignment-school']);
  });

  test('falls back to the student membership classes for practice documents', () => {
    expect(
      getDocumentSubmissionSchoolIds({
        classAssignment: null,
        membership: {
          classesAsStudent: [{ schoolId: 'school-1' }, { schoolId: 'school-1' }],
        },
      })
    ).toEqual(['school-1']);
  });

  test('ignores missing school ids', () => {
    expect(
      getDocumentSubmissionSchoolIds({
        classAssignment: null,
        membership: {
          classesAsStudent: [{ schoolId: null }, { schoolId: '' }],
        },
      })
    ).toEqual([]);
  });
});

describe('getDocumentSubmissionScope', () => {
  test('uses class assignment class as the narrow scope when present', () => {
    expect(
      getDocumentSubmissionScope({
        classAssignment: {
          class: {
            id: 'assignment-class',
            schoolId: 'assignment-school',
            school: { organizationId: 'assignment-org' },
            teachers: [{ id: 'teacher-1' }, { id: 'teacher-1' }],
          },
        },
        membership: {
          classesAsStudent: [
            {
              id: 'student-class',
              schoolId: 'student-school',
              teachers: [{ id: 'teacher-2' }],
            },
          ],
        },
      })
    ).toEqual({
      schoolIds: ['assignment-school'],
      organizationIds: ['assignment-org'],
      classIds: ['assignment-class'],
      teacherProfileIds: ['teacher-1'],
      classScopes: [
        {
          schoolId: 'assignment-school',
          organizationId: 'assignment-org',
          classId: 'assignment-class',
          teacherProfileIds: ['teacher-1'],
        },
      ],
    });
  });

  test('falls back to all student classes for practice documents', () => {
    expect(
      getDocumentSubmissionScope({
        classAssignment: null,
        membership: {
          classesAsStudent: [
            {
              id: 'class-1',
              schoolId: 'school-1',
              school: { organizationId: 'org-1' },
              teachers: [{ id: 'teacher-1' }],
            },
            {
              id: 'class-2',
              schoolId: 'school-2',
              school: { organizationId: 'org-2' },
              teachers: [{ id: 'teacher-2' }],
            },
          ],
        },
      })
    ).toEqual({
      schoolIds: ['school-1', 'school-2'],
      organizationIds: ['org-1', 'org-2'],
      classIds: ['class-1', 'class-2'],
      teacherProfileIds: ['teacher-1', 'teacher-2'],
      classScopes: [
        {
          schoolId: 'school-1',
          organizationId: 'org-1',
          classId: 'class-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          schoolId: 'school-2',
          organizationId: 'org-2',
          classId: 'class-2',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });
  });
});
