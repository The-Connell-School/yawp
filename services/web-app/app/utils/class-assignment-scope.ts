import type { Prisma } from '@app/prisma';
import { HIDE_AP_HISTORY_DOCUMENT_WHERE } from '~/utils/assignment-type-access.server';

export type ClassScopedDocumentWhere = {
  classAssignment: { classId: string };
};

export type StudentClassDocumentsWhere = {
  OR: Array<
    | (ClassScopedDocumentWhere & {
        artifactKind: 'STUDENT';
        membershipId: string;
      })
    | (ClassScopedDocumentWhere & { membershipId: string })
    | {
        classAssignment: {
          classId: string;
          OR: [{ postAt: null }, { postAt: { lte: Date } }];
        };
        group: {
          is: {
            members: {
              some: { membershipId: string; removedAt: null };
            };
          };
        };
      }
    | {
        classAssignmentId: null;
        membershipId: string;
      }
  >;
};

/** Documents tied to assignments deployed in this class (teacher grading surfaces). */
export function buildClassAssignmentDocumentScope(
  classId: string
): ClassScopedDocumentWhere {
  return {
    classAssignment: { classId },
  };
}

export function buildClassTeacherAssignmentTestDocumentBranch(classId: string) {
  return {
    teacherPreviewClassAssignment: { classId },
    artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW' as const,
  };
}

/** Class assignment work that counts as student work (excludes teacher test documents). */
export function buildClassStudentWorkOnAssignmentBranches(
  classId: string
): Array<
  | (ClassScopedDocumentWhere & {
      artifactKind: 'STUDENT';
      membership: { is: { role: 'STUDENT' } };
    })
  | (ClassScopedDocumentWhere & { artifactKind: 'ASSIGNMENT_GROUP' })
> {
  return [
    {
      classAssignment: { classId },
      artifactKind: 'STUDENT',
      membership: { is: { role: 'STUDENT' } },
    },
    {
      classAssignment: { classId },
      artifactKind: 'ASSIGNMENT_GROUP',
    },
  ];
}

export function buildClassAssignmentStudentDocumentCountWhere(
  classAssignmentId: string
): Prisma.DocumentWhereInput {
  return {
    deletedAt: null,
    OR: [
      {
        classAssignmentId,
        OR: [
          { artifactKind: 'ASSIGNMENT_GROUP' },
          {
            artifactKind: 'STUDENT',
            membership: { is: { role: 'STUDENT' } },
          },
        ],
      },
      {
        teacherPreviewClassAssignmentId: classAssignmentId,
        artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
      },
    ],
  };
}

export type EnrolledClassDocumentsWhere = {
  OR: Array<
    | ClassScopedDocumentWhere
    | ReturnType<typeof buildClassTeacherAssignmentTestDocumentBranch>
    | {
        classAssignmentId: null;
        membershipId: { in: string[] };
      }
  >;
};

type TeacherClassAssignmentlessDocumentsWhere = {
  classAssignmentId: null;
  membership: {
    classesAsStudent: { some: { id: { in: string[] } } };
  };
};

/** Class assignment work plus practice docs for currently enrolled students. */
export function buildEnrolledClassDocumentsScope(
  classId: string,
  enrolledMembershipIds: string[]
): EnrolledClassDocumentsWhere {
  const scope: EnrolledClassDocumentsWhere['OR'] = [
    ...buildClassStudentWorkOnAssignmentBranches(classId),
    buildClassTeacherAssignmentTestDocumentBranch(classId),
  ];

  if (enrolledMembershipIds.length > 0) {
    scope.push({
      classAssignmentId: null,
      membershipId: { in: enrolledMembershipIds },
    });
  }

  return { OR: scope };
}

/** Documents for one student in a class view (assignment work + practice / type-only). */
export function buildStudentClassDocumentsScope(params: {
  classId: string;
  membershipId: string;
}): StudentClassDocumentsWhere {
  return {
    OR: [
      {
        classAssignment: { classId: params.classId },
        artifactKind: 'STUDENT',
        membershipId: params.membershipId,
      },
      {
        classAssignment: {
          classId: params.classId,
          OR: [{ postAt: null }, { postAt: { lte: new Date() } }],
        },
        group: {
          is: {
            members: {
              some: {
                membershipId: params.membershipId,
                removedAt: null,
              },
            },
          },
        },
      },
      {
        classAssignmentId: null,
        membershipId: params.membershipId,
      },
    ],
  };
}

export function buildTeacherClassWorkDocumentWhere(params: {
  classIds: string[];
  legacyDocumentIds?: string[];
}): Prisma.DocumentWhereInput {
  const classScope: Prisma.DocumentWhereInput = {
    OR: [
      ...params.classIds.flatMap((classId) => [
        ...buildClassStudentWorkOnAssignmentBranches(classId),
        buildClassTeacherAssignmentTestDocumentBranch(classId),
      ]),
      {
        classAssignmentId: null,
        membership: {
          classesAsStudent: { some: { id: { in: params.classIds } } },
        },
      } satisfies TeacherClassAssignmentlessDocumentsWhere,
    ],
  };

  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    OR: [{ archivedAt: null }, { submissions: { some: {} } }],
    AND: [classScope, HIDE_AP_HISTORY_DOCUMENT_WHERE],
  };

  if (params.legacyDocumentIds && params.legacyDocumentIds.length > 0) {
    (classScope.OR as Prisma.DocumentWhereInput[]).push({
      id: { in: params.legacyDocumentIds },
    });
  }

  return where;
}
