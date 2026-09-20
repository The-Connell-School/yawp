import { prisma } from '~/utils/db.server';
import { buildTeacherDocumentAccessWhere } from '~/utils/grading-auth.server';
import { buildTeacherClassWorkDocumentWhere } from '~/utils/class-assignment-scope.server';
import { resolveTeacherSchoolYearScope } from '~/utils/school-year-scope.server';
import { ALL_SCHOOL_YEARS } from '~/utils/school-year';
import type {
  TeacherDocumentWorkClassSummary,
  TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';
import type { DocumentWorkSort } from '~/utils/teacher-document-work-sort';
import {
  buildGradingQueue,
  buildDocumentNavigationQueue,
  resolveGradingQueueNeighbors,
  resolveDocumentNavigationNeighbors,
  type GradingQueueNeighbors,
  type DocumentNavigationNeighbors,
  type GradingQueueScope,
} from './grading-queue';

type GradingQueueLoaderParams = {
  request: Request;
  membershipId: string;
  organizationId: string;
  userId: string;
  scope: GradingQueueScope;
  sort?: DocumentWorkSort | null;
};

/**
 * The grading queue is rebuilt on every grading-view load rather than being
 * handed along in the URL. Reads use 250-row batches, then reuse the work list's
 * filtering/sort semantics across the complete authorized scope.
 */
const GRADING_QUEUE_DOCUMENT_LIMIT = 250;

function resolveDocumentClass(
  document: {
    classAssignment?: { class: TeacherDocumentWorkClassSummary } | null;
    membership: {
      classesAsStudent: TeacherDocumentWorkClassSummary[];
    } | null;
  },
  options: {
    teacherClassIds: Set<string>;
    fallbackClass?: TeacherDocumentWorkClassSummary | null;
  }
) {
  if (document.classAssignment?.class) return document.classAssignment.class;
  if (options.fallbackClass) return options.fallbackClass;

  const enrolledTeacherClass = document.membership?.classesAsStudent.find(
    (klass) => options.teacherClassIds.has(klass.id)
  );
  if (enrolledTeacherClass) return enrolledTeacherClass;

  return document.membership?.classesAsStudent[0] ?? null;
}

/**
 * Loads the teacher's work list for `scope` and reports the papers either side
 * of the open submission. Returns null when the open paper is not in that list
 * — the header then renders exactly as it does today.
 */
export function loadGradingQueueNeighbors(
  params: GradingQueueLoaderParams & {
    mode?: 'grading';
    submissionId: string;
    documentId?: never;
  }
): Promise<GradingQueueNeighbors | null>;
export function loadGradingQueueNeighbors(
  params: GradingQueueLoaderParams & {
    mode: 'documents';
    documentId: string;
    submissionId?: never;
  }
): Promise<DocumentNavigationNeighbors | null>;
export async function loadGradingQueueNeighbors(params: GradingQueueLoaderParams & {
  submissionId?: string;
  documentId?: string;
  mode?: 'grading' | 'documents';
}): Promise<GradingQueueNeighbors | DocumentNavigationNeighbors | null> {
  const { request, membershipId, submissionId, documentId, scope } = params;
  const mode = params.mode ?? 'grading';
  if (mode === 'grading' && !submissionId) return null;
  if (mode === 'documents' && !documentId) return null;

  const schoolYearScope = await resolveTeacherSchoolYearScope(
    request,
    membershipId
  );

  const classes = await prisma.class.findMany({
    where: {
      teachers: { some: { id: membershipId, isActive: true } },
      school: { organizationId: params.organizationId },
      isArchived: false,
      ...(schoolYearScope === ALL_SCHOOL_YEARS
        ? {}
        : { schoolYear: schoolYearScope }),
      // A class-scoped queue never reaches outside the class it came from.
      ...(scope.kind === 'class' && scope.classId ? { id: scope.classId } : {}),
    },
    select: { id: true, grade: true, period: true, title: true },
    orderBy: [{ grade: 'asc' }, { period: 'asc' }],
  });

  const classIds = classes.map((klass) => klass.id);
  if (classIds.length === 0) return null;

  const classById = new Map(classes.map((klass) => [klass.id, klass]));
  const teacherClassIds = new Set(classIds);

  const forensicRows = await prisma.documentClassForensic.findMany({
    where: { oldClassId: { in: classIds } },
    select: { documentId: true, oldClassId: true },
  });
  const legacyClassIdByDocumentId = new Map(
    forensicRows.map((row) => [row.documentId, row.oldClassId])
  );

  const findBatch = (cursor?: string) =>
    prisma.document.findMany({
      where: {
        AND: [
          buildTeacherClassWorkDocumentWhere({
            classIds,
            legacyDocumentIds: forensicRows.map((row) => row.documentId),
          }),
          buildTeacherDocumentAccessWhere({
            membershipId,
            organizationId: params.organizationId,
          }),
          {
            OR: [
              {
                artifactKind: 'ASSIGNMENT_GROUP',
                group: {
                  members: {
                    none: {
                      removedAt: null,
                      membership: { userId: params.userId },
                    },
                  },
                },
              },
              { membership: { userId: { not: params.userId } } },
            ],
          },
        ],
        ...(mode === 'grading'
          ? { submissions: { some: { unsubmittedAt: null } } }
          : {}),
        ...(scope.filters.classAssignmentIds.length > 0
          ? { classAssignmentId: { in: scope.filters.classAssignmentIds } }
          : {}),
      },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        assignment: {
          select: {
            id: true,
            title: true,
            submitForGrade: true,
            pointValue: true,
          },
        },
        classAssignment: {
          select: {
            class: {
              select: { id: true, grade: true, period: true, title: true },
            },
          },
        },
        membership: {
          select: {
            id: true,
            user: { select: { id: true, name: true, email: true } },
            classesAsStudent: {
              where: { id: { in: classIds } },
              select: { id: true, grade: true, period: true, title: true },
            },
          },
        },
        group: {
          select: {
            id: true,
            label: true,
            members: {
              where: { removedAt: null },
              orderBy: { membershipId: 'asc' },
              select: {
                membershipId: true,
                membership: {
                  select: {
                    id: true,
                    user: { select: { id: true, name: true, email: true } },
                  },
                },
              },
            },
          },
        },
        submissions: {
          where: { unsubmittedAt: null },
          orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
          take: 1,
          select: {
            id: true,
            title: true,
            score: true,
            feedback: true,
            rubricScores: true,
            overallComment: true,
            numericPercentage: true,
            letterGrade: true,
            gradedAt: true,
            releasedAt: true,
            submittedAt: true,
            createdAt: true,
            archivedAt: true,
          },
        },
        _count: { select: { submissions: true } },
      },
      orderBy: { id: 'asc' },
      take: GRADING_QUEUE_DOCUMENT_LIMIT,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

  // Fetch bounded batches without silently truncating a class's queue.
  const allDocuments: Awaited<ReturnType<typeof findBatch>> = [];
  let cursor: string | undefined;
  while (true) {
    const batch = await findBatch(cursor);
    allDocuments.push(...batch);
    if (batch.length < GRADING_QUEUE_DOCUMENT_LIMIT) break;
    const nextCursor = batch[batch.length - 1]?.id;
    if (!nextCursor || nextCursor === cursor)
      throw new Error('Grading queue cursor did not advance');
    cursor = nextCursor;
  }

  const documents: TeacherDocumentWorkRow[] = allDocuments.map((document) => ({
    id: document.id,
    title: document.title,
    updatedAt: new Date(document.updatedAt),
    membership:
      document.membership ??
      ({
        id: `group:${document.group?.id ?? document.id}`,
        user: {
          id: `group:${document.group?.id ?? document.id}`,
          name: document.group?.label ?? 'Collaborative group',
          email: '',
        },
        classesAsStudent: [],
      } as const),
    group: document.group,
    assignment: document.assignment,
    resolvedClass: resolveDocumentClass(document, {
      teacherClassIds,
      fallbackClass:
        classById.get(legacyClassIdByDocumentId.get(document.id) ?? '') ?? null,
    }),
    submissions: document.submissions,
    latestSubmission: document.submissions[0] ?? null,
    submissionCount: document._count.submissions,
  })) as TeacherDocumentWorkRow[];

  if (mode === 'documents') {
    const queue = buildDocumentNavigationQueue({
      documents,
      scope,
      sort: params.sort ?? undefined,
      pinnedDocumentId: documentId,
    });
    return resolveDocumentNavigationNeighbors({ queue, documentId: documentId! });
  }

  const queue = buildGradingQueue({
    documents,
    scope,
    sort: params.sort ?? undefined,
    pinnedSubmissionId: submissionId,
  });

  return resolveGradingQueueNeighbors({ queue, submissionId: submissionId! });
}

export async function loadDocumentNavigationNeighbors(params: {
  request: Request;
  membershipId: string;
  organizationId: string;
  userId: string;
  documentId: string;
  scope: GradingQueueScope;
  sort?: DocumentWorkSort | null;
}): Promise<DocumentNavigationNeighbors | null> {
  const result = await loadGradingQueueNeighbors({
    ...params,
    documentId: params.documentId,
    mode: 'documents',
  });
  return result;
}
