import { describe, expect, test } from 'bun:test';
import {
  buildClassAssignmentStudentDocumentCountWhere,
  buildClassStudentWorkOnAssignmentBranches,
  buildClassTeacherAssignmentTestDocumentBranch,
} from './class-assignment-scope';

describe('buildClassStudentWorkOnAssignmentBranches', () => {
  test('includes student solo work and assignment groups, not teacher test documents', () => {
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
  test('counts student work and teacher test documents on a class assignment', () => {
    expect(buildClassAssignmentStudentDocumentCountWhere('ca-1')).toEqual({
      deletedAt: null,
      OR: [
        {
          classAssignmentId: 'ca-1',
          OR: [
            { artifactKind: 'ASSIGNMENT_GROUP' },
            {
              artifactKind: 'STUDENT',
              membership: { is: { role: 'STUDENT' } },
            },
          ],
        },
        {
          teacherPreviewClassAssignmentId: 'ca-1',
          artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
        },
      ],
    });
  });
});

describe('buildClassTeacherAssignmentTestDocumentBranch', () => {
  test('scopes teacher try-it documents to a class', () => {
    expect(buildClassTeacherAssignmentTestDocumentBranch('class-1')).toEqual({
      teacherPreviewClassAssignment: { classId: 'class-1' },
      artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
    });
  });
});
