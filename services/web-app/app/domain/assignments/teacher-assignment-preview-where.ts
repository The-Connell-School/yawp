import type { Prisma } from '@app/prisma';

export function buildTeacherAssignmentPreviewDocumentsWhere(params: {
  classId: string;
  teacherMembershipId: string;
}): Prisma.DocumentWhereInput {
  return {
    artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
    membershipId: params.teacherMembershipId,
    teacherPreviewClassAssignment: { classId: params.classId },
  };
}
