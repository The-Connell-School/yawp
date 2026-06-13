import type { Prisma } from '@app/prisma';

export type ClassScopedDocumentWhere = {
  classAssignment: { classId: string };
};

export type StudentClassDocumentsWhere = {
  OR: Array<
    | ClassScopedDocumentWhere
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

/** All documents for one student in a class view (includes practice / type-only work). */
export function buildStudentClassDocumentsScope(params: {
  classId: string;
  membershipId: string;
}): StudentClassDocumentsWhere {
  return {
    OR: [
      buildClassAssignmentDocumentScope(params.classId),
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
  const where: Prisma.DocumentWhereInput = {
    deletedAt: null,
    classAssignment: { classId: { in: params.classIds } },
  };

  if (params.legacyDocumentIds && params.legacyDocumentIds.length > 0) {
    return {
      deletedAt: null,
      OR: [
        { classAssignment: { classId: { in: params.classIds } } },
        { id: { in: params.legacyDocumentIds } },
      ],
    };
  }

  return where;
}
