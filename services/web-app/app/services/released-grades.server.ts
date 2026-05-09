import { prisma } from '~/utils/db.server';

export type PileFilters = {
  releasedFrom?: Date;
  releasedTo?: Date;
  studentProfileIds?: string[];
  minGrade?: number;
  maxGrade?: number;
};

export type Pile = {
  assignmentTypeId: string;
  title: string;
  count: number;
  mostRecentReleasedAt: Date;
};

export type PileSubmissionRow = {
  submissionId: string;
  studentProfileId: string;
  studentName: string;
  grade: number | null;
  releasedAt: Date;
};

export type StudentPile = {
  studentProfileId: string;
  studentName: string;
  count: number;
  mostRecentReleasedAt: Date;
};

export type StudentPileSubmissionRow = {
  submissionId: string;
  assignmentTypeId: string;
  assignmentTypeTitle: string;
  grade: number | null;
  releasedAt: Date;
};

/**
 * Build a Prisma `where` for released submissions in a class with optional
 * filters. Submission has no direct `assignmentTypeId` or `studentProfileId` —
 * those filters are reached via `document.assignmentType` /
 * `document.profile.studentProfile`. `numericPercentage` is the grade column.
 */
function buildSubmissionWhere(classId: string, filters: PileFilters) {
  const documentWhere: Record<string, unknown> = {
    assignment: { classId },
    deletedAt: null,
  };

  if (filters.studentProfileIds?.length) {
    documentWhere.profile = {
      studentProfile: { id: { in: filters.studentProfileIds } },
    };
  }

  const releasedAt: Record<string, unknown> = { not: null };
  if (filters.releasedFrom) releasedAt.gte = filters.releasedFrom;
  if (filters.releasedTo) releasedAt.lte = filters.releasedTo;

  const where: Record<string, unknown> = {
    document: documentWhere,
    releasedAt,
  };

  if (filters.minGrade != null || filters.maxGrade != null) {
    const gradeWhere: Record<string, unknown> = {};
    if (filters.minGrade != null) gradeWhere.gte = filters.minGrade;
    if (filters.maxGrade != null) gradeWhere.lte = filters.maxGrade;
    where.numericPercentage = gradeWhere;
  }

  return where;
}

export { buildSubmissionWhere };

// Internal row shapes returned by Prisma (typed loosely so the file compiles
// without depending on generated Prisma payload types).
type PileContentsRow = {
  id: string;
  releasedAt: Date;
  numericPercentage: number | null;
  document: {
    profile: {
      studentProfile: { id: string } | null;
      user: { name: string | null };
    };
  };
};

type StudentPileContentsRow = {
  id: string;
  releasedAt: Date;
  numericPercentage: number | null;
  document: {
    assignmentTypeId: string;
    assignmentType: { title: string } | null;
  };
};

/**
 * Aggregate released submissions in a class into one pile per AssignmentType.
 * Implementation note: `Submission` does not have a direct `assignmentTypeId`
 * column (it's reached via `document.assignmentTypeId`), so we can't use
 * Prisma's `groupBy` directly on a relation. Instead we fetch the minimal
 * fields from each released submission and aggregate in memory.
 */
export async function loadPiles(params: {
  classId: string;
  filters: PileFilters;
}): Promise<Pile[]> {
  const submissions = await prisma.submission.findMany({
    where: buildSubmissionWhere(params.classId, params.filters),
    select: {
      id: true,
      releasedAt: true,
      document: { select: { assignmentTypeId: true } },
    },
    orderBy: { releasedAt: 'desc' },
  });

  if (submissions.length === 0) return [];

  type PileRow = {
    id: string;
    releasedAt: Date;
    document: { assignmentTypeId: string };
  };
  const byType = new Map<
    string,
    { count: number; mostRecentReleasedAt: Date }
  >();
  for (const s of submissions as PileRow[]) {
    const typeId = s.document.assignmentTypeId;
    const releasedAt = s.releasedAt;
    const existing = byType.get(typeId);
    if (existing) {
      existing.count += 1;
      // submissions sorted desc by releasedAt, so first seen is most recent
    } else {
      byType.set(typeId, { count: 1, mostRecentReleasedAt: releasedAt });
    }
  }

  const ids = Array.from(byType.keys());
  const types = await prisma.assignmentType.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  const titleById = new Map<string, string>(
    types.map((t: { id: string; title: string }) => [t.id, t.title])
  );

  const piles: Pile[] = ids.map((id) => ({
    assignmentTypeId: id,
    title: titleById.get(id) ?? '(deleted)',
    count: byType.get(id)!.count,
    mostRecentReleasedAt: byType.get(id)!.mostRecentReleasedAt,
  }));

  piles.sort(
    (a, b) =>
      b.mostRecentReleasedAt.getTime() - a.mostRecentReleasedAt.getTime()
  );
  return piles;
}

export async function loadPileContents(params: {
  classId: string;
  assignmentTypeId: string;
  filters: PileFilters;
  take: number;
  skip: number;
}): Promise<PileSubmissionRow[]> {
  const baseWhere = buildSubmissionWhere(params.classId, params.filters);
  const baseDocument = (baseWhere.document ?? {}) as Record<string, unknown>;
  const submissions = await prisma.submission.findMany({
    where: {
      ...baseWhere,
      document: {
        ...baseDocument,
        assignmentTypeId: params.assignmentTypeId,
      },
    },
    select: {
      id: true,
      releasedAt: true,
      numericPercentage: true,
      document: {
        select: {
          profile: {
            select: {
              studentProfile: { select: { id: true } },
              user: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { releasedAt: 'desc' },
    take: params.take,
    skip: params.skip,
  });

  return (submissions as PileContentsRow[]).map((s) => {
    const doc = s.document;
    return {
      submissionId: s.id,
      studentProfileId: doc.profile.studentProfile?.id ?? '',
      studentName: doc.profile.user.name ?? '',
      grade: s.numericPercentage,
      releasedAt: s.releasedAt,
    };
  });
}

export async function loadStudentPiles(params: {
  classId: string;
  filters: PileFilters;
}): Promise<StudentPile[]> {
  const submissions = await prisma.submission.findMany({
    where: buildSubmissionWhere(params.classId, params.filters),
    select: {
      id: true,
      releasedAt: true,
      document: {
        select: {
          profile: {
            select: {
              studentProfile: { select: { id: true } },
              user: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { releasedAt: 'desc' },
  });

  const byStudent = new Map<string, StudentPile>();
  for (const s of submissions as PileContentsRow[]) {
    const profile = s.document.profile;
    const sp = profile.studentProfile;
    if (!sp) continue;
    const releasedAt = s.releasedAt;
    const existing = byStudent.get(sp.id);
    if (existing) {
      existing.count += 1;
    } else {
      byStudent.set(sp.id, {
        studentProfileId: sp.id,
        studentName: profile.user.name ?? '',
        count: 1,
        mostRecentReleasedAt: releasedAt,
      });
    }
  }

  return Array.from(byStudent.values()).sort(
    (a, b) =>
      b.mostRecentReleasedAt.getTime() - a.mostRecentReleasedAt.getTime()
  );
}

export async function loadStudentPileContents(params: {
  classId: string;
  studentProfileId: string;
  filters: PileFilters;
}): Promise<StudentPileSubmissionRow[]> {
  const baseWhere = buildSubmissionWhere(params.classId, params.filters);
  const baseDocument = (baseWhere.document ?? {}) as Record<string, unknown>;
  const submissions = await prisma.submission.findMany({
    where: {
      ...baseWhere,
      document: {
        ...baseDocument,
        profile: {
          studentProfile: { id: params.studentProfileId },
        },
      },
    },
    select: {
      id: true,
      releasedAt: true,
      numericPercentage: true,
      document: {
        select: {
          assignmentTypeId: true,
          assignmentType: { select: { title: true } },
        },
      },
    },
    orderBy: { releasedAt: 'desc' },
  });

  return (submissions as StudentPileContentsRow[]).map((s) => {
    const doc = s.document;
    return {
      submissionId: s.id,
      assignmentTypeId: doc.assignmentTypeId,
      assignmentTypeTitle: doc.assignmentType?.title ?? '(deleted)',
      grade: s.numericPercentage,
      releasedAt: s.releasedAt,
    };
  });
}
