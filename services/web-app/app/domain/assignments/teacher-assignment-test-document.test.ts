import { describe, expect, test } from 'bun:test';
import { isTeacherAssignmentTestDocument } from './teacher-assignment-test-document';

describe('isTeacherAssignmentTestDocument', () => {
  test('matches teacher try-it documents only', () => {
    expect(isTeacherAssignmentTestDocument('TEACHER_ASSIGNMENT_PREVIEW')).toBe(
      true
    );
    expect(isTeacherAssignmentTestDocument('STUDENT')).toBe(false);
    expect(isTeacherAssignmentTestDocument(null)).toBe(false);
  });
});
