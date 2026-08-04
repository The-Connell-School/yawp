import {
  TEACHER_DOCUMENT_STATUSES,
  getTeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  formatClassLabel,
  getDraftDisplayTitle,
  type TeacherDocumentWorkRow,
} from '~/utils/teacher-document-work-utils';

export const DOCUMENT_WORK_SORT_FIELDS = [
  'student',
  'document',
  'class',
  'assignment',
  'status',
  'submittedAt',
  'gradedAt',
  'lastEdited',
] as const;

export type DocumentWorkSortField = (typeof DOCUMENT_WORK_SORT_FIELDS)[number];
export type DocumentWorkSortDirection = 'asc' | 'desc';

export type DocumentWorkSort = {
  field: DocumentWorkSortField;
  direction: DocumentWorkSortDirection;
};

export const DEFAULT_DOCUMENT_WORK_SORT: DocumentWorkSort = {
  field: 'lastEdited',
  direction: 'desc',
};

export function defaultDirectionForDocumentWorkSortField(
  field: DocumentWorkSortField
): DocumentWorkSortDirection {
  return field === 'submittedAt' ||
    field === 'gradedAt' ||
    field === 'lastEdited'
    ? 'desc'
    : 'asc';
}

export function parseDocumentWorkSort(
  value: unknown
): DocumentWorkSort | undefined {
  if (!value || typeof value !== 'object') return undefined;

  const { field, direction } = value as Record<string, unknown>;
  if (
    typeof field !== 'string' ||
    !DOCUMENT_WORK_SORT_FIELDS.includes(field as DocumentWorkSortField)
  ) {
    return undefined;
  }

  if (direction !== 'asc' && direction !== 'desc') {
    return undefined;
  }

  return {
    field: field as DocumentWorkSortField,
    direction,
  };
}

export function toggleDocumentWorkSort(
  current: DocumentWorkSort,
  field: DocumentWorkSortField
): DocumentWorkSort {
  if (current.field === field) {
    return {
      field,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    field,
    direction: defaultDirectionForDocumentWorkSortField(field),
  };
}

function toDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareNullableDates(
  left: Date | null,
  right: Date | null,
  direction: DocumentWorkSortDirection
) {
  const multiplier = direction === 'asc' ? 1 : -1;

  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  return (left.getTime() - right.getTime()) * multiplier;
}

function compareText(
  left: string,
  right: string,
  collator: Intl.Collator,
  direction: DocumentWorkSortDirection
) {
  const multiplier = direction === 'asc' ? 1 : -1;
  return collator.compare(left, right) * multiplier;
}

function statusSortIndex(document: TeacherDocumentWorkRow) {
  const status = getTeacherDocumentStatus(document.latestSubmission);
  return TEACHER_DOCUMENT_STATUSES.indexOf(status);
}

export function compareTeacherDocumentWorkRows(
  left: TeacherDocumentWorkRow,
  right: TeacherDocumentWorkRow,
  sort: DocumentWorkSort,
  collator: Intl.Collator
) {
  let result = 0;

  switch (sort.field) {
    case 'student':
      result = compareText(
        left.membership.user.name || left.membership.user.email,
        right.membership.user.name || right.membership.user.email,
        collator,
        sort.direction
      );
      break;
    case 'document':
      result = compareText(
        getDraftDisplayTitle(left),
        getDraftDisplayTitle(right),
        collator,
        sort.direction
      );
      break;
    case 'class':
      result = compareText(
        left.resolvedClass ? formatClassLabel(left.resolvedClass) : '',
        right.resolvedClass ? formatClassLabel(right.resolvedClass) : '',
        collator,
        sort.direction
      );
      break;
    case 'assignment':
      result = compareText(
        left.assignment?.title || '',
        right.assignment?.title || '',
        collator,
        sort.direction
      );
      break;
    case 'status': {
      const multiplier = sort.direction === 'asc' ? 1 : -1;
      result = (statusSortIndex(left) - statusSortIndex(right)) * multiplier;
      break;
    }
    case 'submittedAt':
      result = compareNullableDates(
        toDate(
          left.latestSubmission?.submittedAt ?? left.latestSubmission?.createdAt
        ),
        toDate(
          right.latestSubmission?.submittedAt ??
            right.latestSubmission?.createdAt
        ),
        sort.direction
      );
      break;
    case 'gradedAt':
      result = compareNullableDates(
        toDate(left.latestSubmission?.gradedAt),
        toDate(right.latestSubmission?.gradedAt),
        sort.direction
      );
      break;
    case 'lastEdited':
      result = compareNullableDates(
        left.updatedAt,
        right.updatedAt,
        sort.direction
      );
      break;
  }

  if (result !== 0) return result;

  return collator.compare(left.id, right.id);
}

export function sortTeacherDocumentWorkRows<
  T extends TeacherDocumentWorkRow,
>(params: {
  documents: T[];
  sort?: DocumentWorkSort;
  collator: Intl.Collator;
}) {
  const sort = params.sort ?? DEFAULT_DOCUMENT_WORK_SORT;
  return [...params.documents].sort((left, right) =>
    compareTeacherDocumentWorkRows(left, right, sort, params.collator)
  );
}
