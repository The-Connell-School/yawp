import { prisma } from '~/utils/db.server';

export const TEACHER_DASHBOARD_RECENT_CLASS_LIMIT = 6;

type RecentDocumentForClassActivity = {
  id: string;
  updatedAt: Date;
  classAssignmentId: string | null;
  classAssignment: { classId: string } | null;
  assignmentId: string | null;
  membership: { classesAsStudent: { id: string }[] };
};

export function resolveDocumentClassIds(params: {
  documentId: string;
  document: Pick<
    RecentDocumentForClassActivity,
    'classAssignmentId' | 'classAssignment' | 'assignmentId' | 'membership'
  >;
  teacherClassIdSet: Set<string>;
  forensicClassIdByDocumentId: Map<string, string>;
}): string[] {
  const classIds = new Set<string>();

  if (
    params.document.classAssignment?.classId &&
    params.teacherClassIdSet.has(params.document.classAssignment.classId)
  ) {
    classIds.add(params.document.classAssignment.classId);
  }

  const forensicClassId = params.forensicClassIdByDocumentId.get(
    params.documentId
  );
  if (forensicClassId && params.teacherClassIdSet.has(forensicClassId)) {
    classIds.add(forensicClassId);
  }

  if (
    params.document.classAssignmentId === null &&
    params.document.assignmentId === null
  ) {
    for (const klass of params.document.membership.classesAsStudent) {
      if (params.teacherClassIdSet.has(klass.id)) {
        classIds.add(klass.id);
      }
    }
  }

  return [...classIds];
}

function buildTeacherClassDocumentWhere(
  teacherClassIds: string[],
  legacyDocumentIds: string[]
) {
  const where = {
    deletedAt: null,
    OR: [
      { classAssignment: { classId: { in: teacherClassIds } } },
      {
        classAssignmentId: null,
        assignmentId: null,
        membership: {
          classesAsStudent: { some: { id: { in: teacherClassIds } } },
        },
      },
    ] as Array<
      | { classAssignment: { classId: { in: string[] } } }
      | {
          classAssignmentId: null;
          assignmentId: null;
          membership: {
            classesAsStudent: { some: { id: { in: string[] } } };
          };
        }
      | { id: { in: string[] } }
    >,
  };

  if (legacyDocumentIds.length > 0) {
    where.OR.push({ id: { in: legacyDocumentIds } });
  }

  return where;
}

export async function getTeacherRecentActiveClassIds(params: {
  teacherClassIds: string[];
  limit?: number;
}): Promise<string[]> {
  const { teacherClassIds } = params;
  const limit = params.limit ?? TEACHER_DASHBOARD_RECENT_CLASS_LIMIT;

  if (teacherClassIds.length === 0 || limit <= 0) {
    return [];
  }

  const teacherClassIdSet = new Set(teacherClassIds);
  const forensicRows = await prisma.documentClassForensic.findMany({
    where: { oldClassId: { in: teacherClassIds } },
    select: { documentId: true, oldClassId: true },
  });
  const forensicClassIdByDocumentId = new Map(
    forensicRows.map((row) => [row.documentId, row.oldClassId])
  );
  const legacyDocumentIds = forensicRows.map((row) => row.documentId);

  const recentDocuments = await prisma.document.findMany({
    where: buildTeacherClassDocumentWhere(teacherClassIds, legacyDocumentIds),
    select: {
      id: true,
      updatedAt: true,
      classAssignmentId: true,
      classAssignment: { select: { classId: true } },
      assignmentId: true,
      membership: {
        select: {
          classesAsStudent: {
            where: { id: { in: teacherClassIds } },
            select: { id: true },
          },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });

  const latestActivityByClassId = new Map<string, Date>();

  for (const document of recentDocuments) {
    const classIds = resolveDocumentClassIds({
      documentId: document.id,
      document,
      teacherClassIdSet,
      forensicClassIdByDocumentId,
    });

    for (const classId of classIds) {
      if (latestActivityByClassId.has(classId)) continue;
      latestActivityByClassId.set(classId, document.updatedAt);
      if (latestActivityByClassId.size >= limit) {
        break;
      }
    }

    if (latestActivityByClassId.size >= limit) {
      break;
    }
  }

  return [...latestActivityByClassId.entries()]
    .sort(([, a], [, b]) => b.getTime() - a.getTime())
    .slice(0, limit)
    .map(([classId]) => classId);
}
