import { describe, expect, test } from 'bun:test';
import { TEACHER_ASSIGNMENT_PREVIEW_SUBJECT_LABEL } from './teacher-assignment-preview';
import { buildTeacherAssignmentPreviewDocumentsWhere } from './teacher-assignment-preview-where';
import { isTeacherAssignmentPreviewSelfGrading } from './teacher-assignment-preview-grading';

describe('teacher-assignment-preview label', () => {
  test('uses a stable preview subject label', () => {
    expect(TEACHER_ASSIGNMENT_PREVIEW_SUBJECT_LABEL).toBe('You (preview)');
  });
});

describe('isTeacherAssignmentPreviewSelfGrading', () => {
  test('allows the owning teacher on the preview class to use teacher grading', () => {
    expect(
      isTeacherAssignmentPreviewSelfGrading({
        artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
        viewerMembershipId: 'teacher-1',
        viewerRole: 'TEACHER',
        documentOwnerMembershipId: 'teacher-1',
        previewClassTeacherMembershipIds: ['teacher-1', 'teacher-2'],
      })
    ).toBe(true);
  });

  test('rejects student owners and teachers who do not teach the preview class', () => {
    expect(
      isTeacherAssignmentPreviewSelfGrading({
        artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
        viewerMembershipId: 'teacher-2',
        viewerRole: 'TEACHER',
        documentOwnerMembershipId: 'teacher-1',
        previewClassTeacherMembershipIds: ['teacher-1'],
      })
    ).toBe(false);
    expect(
      isTeacherAssignmentPreviewSelfGrading({
        artifactKind: 'STUDENT',
        viewerMembershipId: 'teacher-1',
        viewerRole: 'TEACHER',
        documentOwnerMembershipId: 'teacher-1',
        previewClassTeacherMembershipIds: ['teacher-1'],
      })
    ).toBe(false);
  });
});

describe('buildTeacherAssignmentPreviewDocumentsWhere', () => {
  test('scopes previews to one teacher and one class', () => {
    expect(
      buildTeacherAssignmentPreviewDocumentsWhere({
        classId: 'class-1',
        teacherMembershipId: 'teacher-1',
      })
    ).toEqual({
      artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
      membershipId: 'teacher-1',
      teacherPreviewClassAssignment: { classId: 'class-1' },
    });
  });
});
