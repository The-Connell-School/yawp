import { describe, expect, test } from 'bun:test';

import {
  showAssignmentTypeDocumentsSection,
  teacherAssignmentTypeNewMenuItems,
} from './assignment-type-detail-page-chrome';

describe('assignment type detail page chrome', () => {
  test('hides the documents section for teachers', () => {
    expect(showAssignmentTypeDocumentsSection('TEACHER')).toBe(false);
    expect(showAssignmentTypeDocumentsSection('STUDENT')).toBe(true);
  });

  test('teacher New menu offers Assignment without Document', () => {
    expect(teacherAssignmentTypeNewMenuItems({ showAnyPromptGenerator: false })).toEqual([
      'Assignment',
    ]);
    expect(teacherAssignmentTypeNewMenuItems({ showAnyPromptGenerator: true })).toEqual([
      'Assignment',
      'Generate a prompt',
    ]);
    for (const labels of [
      teacherAssignmentTypeNewMenuItems({ showAnyPromptGenerator: false }),
      teacherAssignmentTypeNewMenuItems({ showAnyPromptGenerator: true }),
    ]) {
      expect(labels).not.toContain('Document');
    }
  });
});
