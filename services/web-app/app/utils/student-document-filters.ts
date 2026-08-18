import { formatClassLabel } from './class-display';
import { UNASSIGNED_LABEL } from './student-document-grouping';
import {
  parseDocumentWorkFilterIds,
  serializeDocumentWorkFilterIds,
} from './teacher-document-work-filter-options';
import {
  STUDENT_DOCUMENT_STATUSES,
  getStudentDocumentStatus,
  type StudentDocumentStatus,
  type StudentStatusSubmission,
} from './student-document-status';

/**
 * The student's My Documents list mirrors the teacher Documents surface: the
 * same `class` / `assignment` / `status` search params, the same comma-joined id
 * serialization, and the same "no param means all" convention. The student
 * surface drops the teacher's `student`, `q`, and `group` params — a student
 * only ever sees their own work, and the page is always grouped by class.
 */
export type StudentDocumentFilters = {
  classIds: string[];
  assignmentIds: string[];
  status: StudentDocumentStatus | 'all';
};

/**
 * Sentinel id for the "Not tied to a class" bucket. The student list has a real
 * group for practice writing that belongs to no class, so the class filter needs
 * a way to select it. The teacher surface has no such bucket.
 */
export const UNASSIGNED_CLASS_FILTER_ID = '__unassigned__';

export type StudentDocumentFilterOption = {
  id: string;
  label: string;
  classIds?: string[];
};

export type StudentDocumentFilterRow = {
  classAssignment: { class: Parameters<typeof formatClassLabel>[0] & { id: string } } | null;
  assignment: { id: string; title: string | null } | null;
  submissions?: StudentStatusSubmission[] | null;
};

function isStudentDocumentStatus(
  value: string
): value is StudentDocumentStatus {
  return (STUDENT_DOCUMENT_STATUSES as string[]).includes(value);
}

export function parseStudentDocumentFilters(
  searchParams: URLSearchParams
): StudentDocumentFilters {
  const status = searchParams.get('status') ?? 'all';

  return {
    classIds: parseDocumentWorkFilterIds(searchParams.get('class')),
    assignmentIds: parseDocumentWorkFilterIds(searchParams.get('assignment')),
    status: isStudentDocumentStatus(status) ? status : 'all',
  };
}

export function serializeStudentDocumentFilters(
  filters: StudentDocumentFilters,
  base?: URLSearchParams
): URLSearchParams {
  const next = new URLSearchParams(base);

  const applyIds = (key: string, ids: string[]) => {
    const serialized = serializeDocumentWorkFilterIds(ids);
    if (serialized) {
      next.set(key, serialized);
    } else {
      next.delete(key);
    }
  };

  applyIds('class', filters.classIds);
  applyIds('assignment', filters.assignmentIds);

  if (filters.status === 'all') {
    next.delete('status');
  } else {
    next.set('status', filters.status);
  }

  return next;
}

function documentClassFilterId(document: StudentDocumentFilterRow) {
  return document.classAssignment?.class.id ?? UNASSIGNED_CLASS_FILTER_ID;
}

export function filterStudentDocuments<T extends StudentDocumentFilterRow>(
  documents: T[],
  filters: StudentDocumentFilters
): T[] {
  return documents.filter((document) => {
    if (
      filters.classIds.length > 0 &&
      !filters.classIds.includes(documentClassFilterId(document))
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

    if (
      filters.status !== 'all' &&
      getStudentDocumentStatus(document.submissions) !== filters.status
    ) {
      return false;
    }

    return true;
  });
}

export function buildStudentClassFilterOptions(
  documents: StudentDocumentFilterRow[]
): StudentDocumentFilterOption[] {
  const options = new Map<string, StudentDocumentFilterOption>();
  let hasUnassigned = false;

  for (const document of documents) {
    const klass = document.classAssignment?.class;

    if (!klass) {
      hasUnassigned = true;
      continue;
    }

    if (!options.has(klass.id)) {
      options.set(klass.id, { id: klass.id, label: formatClassLabel(klass) });
    }
  }

  const classOptions = [...options.values()];

  return hasUnassigned
    ? [
        ...classOptions,
        { id: UNASSIGNED_CLASS_FILTER_ID, label: UNASSIGNED_LABEL },
      ]
    : classOptions;
}

export function buildStudentAssignmentFilterOptions(
  documents: StudentDocumentFilterRow[]
): StudentDocumentFilterOption[] {
  const options = new Map<
    string,
    { id: string; label: string; classIds: Set<string> }
  >();

  for (const document of documents) {
    const assignment = document.assignment;
    if (!assignment) continue;

    const existing =
      options.get(assignment.id) ??
      (() => {
        const created = {
          id: assignment.id,
          label: assignment.title?.trim() || 'Untitled assignment',
          classIds: new Set<string>(),
        };
        options.set(assignment.id, created);
        return created;
      })();

    const classId = document.classAssignment?.class.id;
    if (classId) existing.classIds.add(classId);
  }

  return [...options.values()].map(({ id, label, classIds }) => ({
    id,
    label,
    classIds: [...classIds],
  }));
}

/**
 * Mirrors the teacher panel: when a class is selected, only the assignments that
 * belong to it stay pickable.
 */
export function visibleStudentAssignmentOptions(
  assignments: StudentDocumentFilterOption[],
  classIds: string[]
): StudentDocumentFilterOption[] {
  if (classIds.length === 0) return assignments;

  return assignments.filter((assignment) =>
    classIds.some((classId) => assignment.classIds?.includes(classId))
  );
}

export function hasActiveStudentDocumentFilters(
  filters: StudentDocumentFilters
): boolean {
  return (
    filters.classIds.length > 0 ||
    filters.assignmentIds.length > 0 ||
    filters.status !== 'all'
  );
}
