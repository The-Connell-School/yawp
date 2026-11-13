import { prisma } from '~/utils/db.server';
import { hasMeaningfulGrade } from '~/utils/teacher-document-status';
import { buildClassTeacherAssignmentTestDocumentBranch } from './class-assignment-scope';

type ClassCardStats = {
  ungradedCount: number;
  gradedUnreleasedCount: number;
  documentCount: number;
};

const submissionSelect = {
  score: true,
  feedback: true,
  rubricScores: true,
  overallComment: true,
  numericPercentage: true,
  letterGrade: true,
  releasedAt: true,
  gradedAt: true,
} as const;

function statsFromDocuments(
  documents: Array<{
    submissions: Array<{
      score: string | null;
      feedback: string | null;
      rubricScores: unknown;
      overallComment: string | null;
      numericPercentage: number | null;
      letterGrade: string | null;
      releasedAt: Date | null;
      gradedAt: Date | null;
    }>;
  }>
): ClassCardStats {
  const latestSubmissions = documents.flatMap((document) => document.submissions);

  const ungradedCount = latestSubmissions.filter(
    (submission) =>
      !hasMeaningfulGrade(submission) && !submission.releasedAt
  ).length;

  const gradedUnreleasedCount = latestSubmissions.filter(
    (submission) =>
      hasMeaningfulGrade(submission) && !submission.releasedAt
  ).length;

  return {
    ungradedCount,
    gradedUnreleasedCount,
    documentCount: documents.length,
  };
}

function classIdForCardStatsDocument(document: {
  classAssignment: { classId: string } | null;
  teacherPreviewClassAssignment: { classId: string } | null;
}): string | undefined {
  return (
    document.classAssignment?.classId ??
    document.teacherPreviewClassAssignment?.classId
  );
}

export async function getTeacherClassCardStats(
  classId: string
): Promise<ClassCardStats> {
  const documents = await prisma.document.findMany({
    where: {
      deletedAt: null,
      OR: [
        { classAssignment: { classId } },
        buildClassTeacherAssignmentTestDocumentBranch(classId),
      ],
    },
    select: {
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: submissionSelect,
      },
    },
  });

  return statsFromDocuments(documents);
}

export async function getTeacherClassCardStatsByClassIds(
  classIds: string[]
): Promise<Map<string, ClassCardStats>> {
  const uniqueClassIds = [...new Set(classIds)];
  const stats = new Map<string, ClassCardStats>();

  if (uniqueClassIds.length === 0) {
    return stats;
  }

  const empty: ClassCardStats = {
    ungradedCount: 0,
    gradedUnreleasedCount: 0,
    documentCount: 0,
  };
  for (const classId of uniqueClassIds) {
    stats.set(classId, { ...empty });
  }

  const documents = await prisma.document.findMany({
    where: {
      deletedAt: null,
      OR: [
        { classAssignment: { classId: { in: uniqueClassIds } } },
        ...uniqueClassIds.map((id) =>
          buildClassTeacherAssignmentTestDocumentBranch(id)
        ),
      ],
    },
    select: {
      classAssignment: { select: { classId: true } },
      teacherPreviewClassAssignment: { select: { classId: true } },
      submissions: {
        orderBy: { submittedAt: 'desc' },
        take: 1,
        select: submissionSelect,
      },
    },
  });

  const byClass = new Map<string, typeof documents>();
  for (const document of documents) {
    const classId = classIdForCardStatsDocument(document);
    if (!classId) continue;
    const list = byClass.get(classId) ?? [];
    list.push(document);
    byClass.set(classId, list);
  }

  for (const [classId, classDocuments] of byClass) {
    stats.set(classId, statsFromDocuments(classDocuments));
  }

  return stats;
}
