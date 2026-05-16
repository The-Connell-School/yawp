import { describe, expect, test } from 'bun:test';

import { getDocumentSubmissionSchoolIds } from './document-submission-scope.server';

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
