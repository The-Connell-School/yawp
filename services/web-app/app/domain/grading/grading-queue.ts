import {
  DEFAULT_DOCUMENT_WORK_SORT,
  DOCUMENT_WORK_SORT_FIELDS,
  sortTeacherDocumentWorkRows,
  type DocumentWorkSort,
  type DocumentWorkSortField,
} from '~/utils/teacher-document-work-sort';
import {
  buildStudentFilterOptionsFromDocuments,
  studentMatchesStudentFilters,
} from '~/utils/teacher-document-work-filter-options';
import {
  formatClassLabel,
  getDraftDisplayTitle,
  type TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';
import {
  TEACHER_DOCUMENT_STATUSES,
  getTeacherDocumentStatus,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';

/**
 * Grading queue navigation ("next student" arrows in the grading header).
 *
 * The queue is never persisted. It is rebuilt from the `exitTo` target the
 * work list already stamps onto every detail link, plus the `queueSort` param
 * this module adds, so the arrows walk students in exactly the order the
 * teacher is looking at on the list they came from.
 */

/** Sort carried on the detail link so the arrows match the list's column sort. */
export const GRADING_QUEUE_SORT_PARAM = 'queueSort';

export type GradingQueueScopeKind = 'documents' | 'class';

export type GradingQueueFilters = {
  studentIds: string[];
  classIds: string[];
  assignmentIds: string[];
  classAssignmentIds: string[];
  status: TeacherDocumentStatus | 'all';
  query: string;
};

export type GradingQueueScope = {
  kind: GradingQueueScopeKind;
  /** Set only for the class-scoped work list. */
  classId: string | null;
  filters: GradingQueueFilters;
};

export type GradingQueueEntry = {
  submissionId: string;
  documentId: string;
  studentName: string;
  documentTitle: string;
  className: string | null;
  status: TeacherDocumentStatus;
};

export type GradingQueueNeighbors = {
  previous: GradingQueueEntry | null;
  next: GradingQueueEntry | null;
  /** 1-based position of the open submission within the queue. */
  position: number;
  total: number;
};

export function serializeGradingQueueSort(sort: DocumentWorkSort): string {
  return `${sort.field}:${sort.direction}`;
}

export function parseGradingQueueSort(
  value: string | null | undefined
): DocumentWorkSort | null {
  if (!value) return null;

  const [field, direction] = value.split(':');
  if (
    !DOCUMENT_WORK_SORT_FIELDS.includes(field as DocumentWorkSortField) ||
    (direction !== 'asc' && direction !== 'desc')
  ) {
    return null;
  }

  return { field: field as DocumentWorkSortField, direction };
}

function parseFilterIds(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseStatus(value: string | null): TeacherDocumentStatus | 'all' {
  return TEACHER_DOCUMENT_STATUSES.includes(value as TeacherDocumentStatus)
    ? (value as TeacherDocumentStatus)
    : 'all';
}

const CLASS_WORK_LIST_PATTERN = /^\/app\/my-classes\/([^/]+)\/?$/;

/**
 * Reads the work list the teacher came from out of its `exitTo` target.
 *
 * Returns null for anything that is not a teacher work list — entering the
 * grading view from a link, a bookmark, or the student side leaves the header
 * exactly as it is today.
 */
export function parseGradingQueueScope(
  exitTo: string | null | undefined
): GradingQueueScope | null {
  if (!exitTo) return null;
  if (!exitTo.startsWith('/') || exitTo.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(exitTo, 'https://yawp.invalid');
  } catch {
    return null;
  }

  const params = url.searchParams;
  const pathname = url.pathname.replace(/\/$/, '') || '/';

  if (pathname === '/app/documents') {
    return {
      kind: 'documents',
      classId: null,
      filters: {
        studentIds: parseFilterIds(params.get('student')),
        classIds: parseFilterIds(params.get('class')),
        assignmentIds: parseFilterIds(params.get('assignment')),
        classAssignmentIds: [],
        status: parseStatus(params.get('status')),
        query: (params.get('q') ?? '').trim(),
      },
    };
  }

  const classMatch = CLASS_WORK_LIST_PATTERN.exec(url.pathname);
  if (classMatch) {
    // The class page only shows the work list on its documents tab; any other
    // tab is a different view and gets no queue.
    const tab = params.get('tab');
    if (tab && tab !== 'documents') return null;

    return {
      kind: 'class',
      classId: classMatch[1],
      filters: {
        studentIds: parseFilterIds(params.get('studentId')),
        classIds: [classMatch[1]],
        assignmentIds: parseFilterIds(params.get('assignmentId')),
        classAssignmentIds: parseFilterIds(params.get('classAssignmentId')),
        status: parseStatus(params.get('status')),
        query: (params.get('q') ?? '').trim(),
      },
    };
  }

  return null;
}

function matchesQuery(document: TeacherDocumentWorkRow, query: string) {
  if (!query) return true;

  const haystack = [
    document.title,
    document.assignment?.title,
    document.membership.user.name,
    document.membership.user.email,
    ...(document.group?.members.flatMap((member) => [
      member.membership.user.name,
      member.membership.user.email,
    ]) ?? []),
    document.latestSubmission?.title,
    document.resolvedClass ? formatClassLabel(document.resolvedClass) : null,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function matchesNonStatusFilters(
  document: TeacherDocumentWorkRow,
  filters: GradingQueueFilters,
  studentOptions: ReturnType<typeof buildStudentFilterOptionsFromDocuments>
) {
  if (
    !studentMatchesStudentFilters(document, filters.studentIds, studentOptions)
  ) {
    return false;
  }

  if (
    filters.classIds.length > 0 &&
    (!document.resolvedClass?.id ||
      !filters.classIds.includes(document.resolvedClass.id))
  ) {
    return false;
  }

  if (
    filters.assignmentIds.length > 0 &&
    (!document.assignment?.id ||
      !filters.assignmentIds.includes(document.assignment.id))
  ) {
    return false;
  }

  return matchesQuery(document, filters.query);
}

function toQueueEntry(document: TeacherDocumentWorkRow): GradingQueueEntry | null {
  const submission = document.latestSubmission;
  if (!submission?.id) return null;

  return {
    submissionId: submission.id,
    documentId: document.id,
    studentName:
      document.group?.label ??
      document.membership.user.name ??
      document.membership.user.email ??
      'Student',
    documentTitle: getDraftDisplayTitle(document),
    className: document.resolvedClass
      ? formatClassLabel(document.resolvedClass)
      : null,
    status: getTeacherDocumentStatus(submission),
  };
}

/**
 * Orders the papers a teacher can flip between from the grading header.
 *
 * `pinnedSubmissionId` keeps the open paper in the queue even once it stops
 * matching the list's status filter. Without it, releasing a grade off a
 * "Needs Grading" list would drop the paper the teacher is standing on and
 * take both arrows with it — exactly when they want to move to the next one.
 */
export function buildGradingQueue(params: {
  documents: TeacherDocumentWorkRow[];
  scope: GradingQueueScope;
  sort?: DocumentWorkSort;
  pinnedSubmissionId?: string | null;
  collator?: Intl.Collator;
}): GradingQueueEntry[] {
  const { documents, scope, pinnedSubmissionId = null } = params;
  const sort = params.sort ?? DEFAULT_DOCUMENT_WORK_SORT;
  const collator =
    params.collator ?? new Intl.Collator(undefined, { sensitivity: 'base' });

  const studentOptions = buildStudentFilterOptionsFromDocuments(documents);

  const withinScope = documents.filter((document) =>
    matchesNonStatusFilters(document, scope.filters, studentOptions)
  );

  const matching = withinScope.filter((document) => {
    if (scope.filters.status === 'all') return true;
    if (
      pinnedSubmissionId &&
      document.latestSubmission?.id === pinnedSubmissionId
    ) {
      return true;
    }
    return (
      getTeacherDocumentStatus(document.latestSubmission) ===
      scope.filters.status
    );
  });

  return sortTeacherDocumentWorkRows({ documents: matching, sort, collator })
    .map(toQueueEntry)
    .filter((entry): entry is GradingQueueEntry => entry !== null);
}

export function resolveGradingQueueNeighbors(params: {
  queue: GradingQueueEntry[];
  submissionId: string;
}): GradingQueueNeighbors | null {
  const index = params.queue.findIndex(
    (entry) => entry.submissionId === params.submissionId
  );
  if (index === -1) return null;

  return {
    previous: params.queue[index - 1] ?? null,
    next: params.queue[index + 1] ?? null,
    position: index + 1,
    total: params.queue.length,
  };
}

/** Detail link for a neighbour, carrying the queue context forward. */
export function buildGradingQueueHref(params: {
  submissionId: string;
  exitTo: string | null;
  sort?: DocumentWorkSort | null;
}): string {
  const search = new URLSearchParams();
  search.set('edit', '1');
  if (params.exitTo) search.set('exitTo', params.exitTo);
  if (params.sort) {
    search.set(GRADING_QUEUE_SORT_PARAM, serializeGradingQueueSort(params.sort));
  }

  return `/app/submissions/${params.submissionId}?${search.toString()}`;
}
