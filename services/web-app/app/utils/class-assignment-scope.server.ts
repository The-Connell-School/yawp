import type { Prisma } from '@app/prisma';

export type ClassScopedDocumentWhere = {
  classAssignment: { classId: string };
};

export type StudentClassDocumentsWhere = {
  OR: Array<
    | (ClassScopedDocumentWhere & { membershipId: string })
    | (ClassScopedDocumentWhere & {
        group: {
          is: {
            members: {
              some: { membershipId: string; removedAt: null };
            };
          };
        };
      })
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

export type EnrolledClassDocumentsWhere = {
  OR: Array<
    | ClassScopedDocumentWhere
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
    buildClassAssignmentDocumentScope(classId),
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
        ...buildClassAssignmentDocumentScope(params.classId),
        membershipId: params.membershipId,
      },
      {
        ...buildClassAssignmentDocumentScope(params.classId),
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
      { classAssignment: { classId: { in: params.classIds } } },
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
    AND: [classScope],
  };

  if (params.legacyDocumentIds && params.legacyDocumentIds.length > 0) {
    (classScope.OR as Prisma.DocumentWhereInput[]).push({
      id: { in: params.legacyDocumentIds },
    });
  }

  return where;
}
