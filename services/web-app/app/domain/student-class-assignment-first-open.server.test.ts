import { describe, expect, test } from 'bun:test';
import {
  isNewStudentClassAssignment,
  openedClassAssignmentIdsForStudent,
} from './student-class-assignment-first-open.server';

describe('openedClassAssignmentIdsForStudent', () => {
  test('merges explicit first-open rows with document class assignments', () => {
    const opened = openedClassAssignmentIdsForStudent({
      firstOpenClassAssignmentIds: ['ca-1'],
      documentClassAssignmentIds: ['ca-2', null, 'ca-1'],
    });

    expect([...opened].sort()).toEqual(['ca-1', 'ca-2']);
  });
});

describe('isNewStudentClassAssignment', () => {
  test('treats assignments outside the opened set as new', () => {
    const opened = openedClassAssignmentIdsForStudent({
      firstOpenClassAssignmentIds: ['ca-1'],
      documentClassAssignmentIds: [],
    });

    expect(isNewStudentClassAssignment('ca-2', opened)).toBe(true);
    expect(isNewStudentClassAssignment('ca-1', opened)).toBe(false);
  });
});
