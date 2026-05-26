import { describe, expect, test } from 'bun:test';

import {
  getDocumentSubmissionSchoolIds,
  getDocumentSubmissionScope,
} from './document-submission-scope.server';

describe('getDocumentSubmissionSchoolIds', () => {
  test('uses the assignment class school for assignment-backed documents', () => {
    expect(
      getDocumentSubmissionSchoolIds({
        assignment: { class: { schoolId: 'assignment-school' } },
        studentProfile: { classes: [{ schoolId: 'student-school' }] },
      })
    ).toEqual(['assignment-school']);
  });

  test('falls back to the student profile classes for practice documents', () => {
    expect(
      getDocumentSubmissionSchoolIds({
        assignment: null,
        studentProfile: {
          classes: [{ schoolId: 'school-1' }, { schoolId: 'school-1' }],
        },
      })
    ).toEqual(['school-1']);
  });

  test('ignores missing school ids', () => {
    expect(
      getDocumentSubmissionSchoolIds({
        assignment: null,
        studentProfile: { classes: [{ schoolId: null }, { schoolId: '' }] },
      })
    ).toEqual([]);
  });
});

describe('getDocumentSubmissionScope', () => {
  test('uses assignment class as the narrow scope when present', () => {
    expect(
      getDocumentSubmissionScope({
        assignment: {
          class: {
            id: 'assignment-class',
            schoolId: 'assignment-school',
            teachers: [{ id: 'teacher-1' }, { id: 'teacher-1' }],
          },
        },
        studentProfile: {
          classes: [
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
      classIds: ['assignment-class'],
      teacherProfileIds: ['teacher-1'],
      classScopes: [
        {
          schoolId: 'assignment-school',
          classId: 'assignment-class',
          teacherProfileIds: ['teacher-1'],
        },
      ],
    });
  });

  test('falls back to all student classes for practice documents', () => {
    expect(
      getDocumentSubmissionScope({
        assignment: null,
        studentProfile: {
          classes: [
            {
              id: 'class-1',
              schoolId: 'school-1',
              teachers: [{ id: 'teacher-1' }],
            },
            {
              id: 'class-2',
              schoolId: 'school-2',
              teachers: [{ id: 'teacher-2' }],
            },
          ],
        },
      })
    ).toEqual({
      schoolIds: ['school-1', 'school-2'],
      classIds: ['class-1', 'class-2'],
      teacherProfileIds: ['teacher-1', 'teacher-2'],
      classScopes: [
        {
          schoolId: 'school-1',
          classId: 'class-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          schoolId: 'school-2',
          classId: 'class-2',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });
  });
});
