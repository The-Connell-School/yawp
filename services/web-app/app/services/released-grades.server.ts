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

  const byType = new Map<
    string,
    { count: number; mostRecentReleasedAt: Date }
  >();
  for (const s of submissions) {
    const typeId = (s as { document: { assignmentTypeId: string } }).document
      .assignmentTypeId;
    const releasedAt = (s as { releasedAt: Date }).releasedAt;
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
  const titleById = new Map(types.map((t) => [t.id, t.title]));

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

  return submissions.map((s) => {
    const doc = (
      s as {
        document: {
          profile: {
            studentProfile: { id: string } | null;
            user: { name: string | null };
          };
        };
      }
    ).document;
    return {
      submissionId: s.id as string,
      studentProfileId: doc.profile.studentProfile?.id ?? '',
      studentName: doc.profile.user.name ?? '',
      grade: (s as { numericPercentage: number | null }).numericPercentage,
      releasedAt: (s as { releasedAt: Date }).releasedAt,
    };
  });
}
