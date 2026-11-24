import type { Prisma } from '@app/prisma';
import { HIDE_AP_HISTORY_DOCUMENT_WHERE } from '~/utils/assignment-type-access.server';
import {
  createdAtInSchoolYear,
  isSchoolYear,
} from '~/utils/school-year';

export type ClassScopedDocumentWhere = {
  classAssignment: { classId: string };
};

export type AssignmentlessInSchoolYearWhere = {
  classAssignmentId: null;
  createdAt: { gte: Date; lt: Date };
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
    | (AssignmentlessInSchoolYearWhere & { membershipId: string })
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

/**
 * Practice / unlinked writing is only attached to a class when it was created
 * in that class's school year. Otherwise a returning student's older free
 * writes (or documents orphaned when an assignment was deleted) follow them
 * into a new teacher's class.
 */
export function buildAssignmentlessDocumentsInSchoolYearWhere<
  T extends Record<string, unknown>,
>(schoolYear: string, enrollment: T): (AssignmentlessInSchoolYearWhere & T) | null {
  if (!isSchoolYear(schoolYear)) return null;
  return {
    classAssignmentId: null,
    ...createdAtInSchoolYear(schoolYear),
    ...enrollment,
  };
}

export function assignmentlessBranchesForTeacherClasses(
  classes: { id: string; schoolYear: string }[]
): Array<
  AssignmentlessInSchoolYearWhere & {
    membership: { classesAsStudent: { some: { id: { in: string[] } } } };
  }
> {
  const idsByYear = new Map<string, string[]>();
  for (const klass of classes) {
    if (!isSchoolYear(klass.schoolYear)) continue;
    const ids = idsByYear.get(klass.schoolYear) ?? [];
    ids.push(klass.id);
    idsByYear.set(klass.schoolYear, ids);
  }

  return [...idsByYear.entries()].flatMap(([schoolYear, ids]) => {
    const branch = buildAssignmentlessDocumentsInSchoolYearWhere(schoolYear, {
      membership: {
        classesAsStudent: { some: { id: { in: ids } } },
      },
    });
    return branch ? [branch] : [];
  });
}

export type EnrolledClassDocumentsWhere = {
  OR: Array<
    | ClassScopedDocumentWhere
    | ReturnType<typeof buildClassTeacherAssignmentTestDocumentBranch>
    | (AssignmentlessInSchoolYearWhere & { membershipId: { in: string[] } })
  >;
};

/** Class assignment work plus same-year practice docs for currently enrolled students. */
export function buildEnrolledClassDocumentsScope(
  classId: string,
  enrolledMembershipIds: string[],
  schoolYear: string
): EnrolledClassDocumentsWhere {
  const scope: EnrolledClassDocumentsWhere['OR'] = [
    ...buildClassStudentWorkOnAssignmentBranches(classId),
    buildClassTeacherAssignmentTestDocumentBranch(classId),
  ];

  if (enrolledMembershipIds.length > 0) {
    const assignmentless = buildAssignmentlessDocumentsInSchoolYearWhere(
      schoolYear,
      { membershipId: { in: enrolledMembershipIds } }
    );
    if (assignmentless) scope.push(assignmentless);
  }

  return { OR: scope };
}

/** Documents for one student in a class view (assignment work + same-year practice). */
export function buildStudentClassDocumentsScope(params: {
  classId: string;
  membershipId: string;
  schoolYear: string;
}): StudentClassDocumentsWhere {
  const assignmentless = buildAssignmentlessDocumentsInSchoolYearWhere(
    params.schoolYear,
    { membershipId: params.membershipId }
  );

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
      ...(assignmentless ? [assignmentless] : []),
    ],
  };
}

export function buildTeacherClassWorkDocumentWhere(params: {
  classIds: string[];
  classes?: { id: string; schoolYear: string }[];
  legacyDocumentIds?: string[];
}): Prisma.DocumentWhereInput {
  const assignmentless = assignmentlessBranchesForTeacherClasses(
    params.classes ??
      params.classIds.map((id) => ({ id, schoolYear: '' }))
  );

  const classScope: Prisma.DocumentWhereInput = {
    OR: [
      ...params.classIds.flatMap((classId) => [
        ...buildClassStudentWorkOnAssignmentBranches(classId),
        buildClassTeacherAssignmentTestDocumentBranch(classId),
      ]),
      ...assignmentless,
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
