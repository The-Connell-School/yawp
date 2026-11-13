import { describe, expect, test } from 'bun:test';
import {
  buildClassAssignmentStudentDocumentCountWhere,
  buildClassStudentWorkOnAssignmentBranches,
} from './class-assignment-scope';

describe('buildClassStudentWorkOnAssignmentBranches', () => {
  test('includes student solo work and assignment groups, not teacher previews', () => {
    expect(buildClassStudentWorkOnAssignmentBranches('class-1')).toEqual([
      {
        classAssignment: { classId: 'class-1' },
        artifactKind: 'STUDENT',
        membership: { is: { role: 'STUDENT' } },
      },
      {
        classAssignment: { classId: 'class-1' },
        artifactKind: 'ASSIGNMENT_GROUP',
      },
    ]);
  });
});

describe('buildClassAssignmentStudentDocumentCountWhere', () => {
  test('counts only student work on a class assignment', () => {
    expect(
      buildClassAssignmentStudentDocumentCountWhere('ca-1')
    ).toMatchObject({
      classAssignmentId: 'ca-1',
      deletedAt: null,
    });
  });
});
