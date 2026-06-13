import {
  TEACHER_DOCUMENT_STATUSES,
  TEACHER_DOCUMENT_STATUS_LABELS,
  getTeacherDocumentStatus,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';

import {
  formatClassLabel,
  type TeacherDocumentWorkRow,
} from './teacher-document-work-utils';

export type DocumentGroupMode =
  | 'none'
  | 'class'
  | 'student'
  | 'assignment'
  | 'status';

export type TeacherDocumentWorkGroup<
  T extends TeacherDocumentWorkRow = TeacherDocumentWorkRow,
> = {
  key: string;
  label: string;
  documents: T[];
};

export function parseDocumentGroupMode(
  value: string | null | undefined
): DocumentGroupMode {
  if (
    value === 'class' ||
    value === 'student' ||
    value === 'assignment' ||
    value === 'status'
  ) {
    return value;
  }

  return 'none';
}

export function buildTeacherDocumentWorkGroups<
  T extends TeacherDocumentWorkRow,
>(params: {
  documents: T[];
  mode: DocumentGroupMode;
  collator: Intl.Collator;
}): TeacherDocumentWorkGroup<T>[] {
  const sortedDocuments = [...params.documents].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );

  if (params.mode === 'none') {
    return [
      {
        key: 'all',
        label: '',
        documents: sortedDocuments,
      },
    ];
  }

  const groups = new Map<string, TeacherDocumentWorkGroup<T>>();

  for (const document of sortedDocuments) {
    const key =
      params.mode === 'class'
        ? (document.resolvedClass?.id ?? 'no-class')
        : params.mode === 'student'
          ? document.membership.id
          : params.mode === 'assignment'
            ? (document.assignment?.id ?? 'no-assignment')
            : getTeacherDocumentStatus(document.latestSubmission);
    const label =
      params.mode === 'class'
        ? document.resolvedClass
          ? formatClassLabel(document.resolvedClass)
          : 'No class'
        : params.mode === 'student'
          ? document.membership.user.name || document.membership.user.email
          : params.mode === 'assignment'
            ? document.assignment?.title || 'No assignment'
            : TEACHER_DOCUMENT_STATUS_LABELS[key as TeacherDocumentStatus];

    const existing = groups.get(key);
    if (existing) {
      existing.documents.push(document);
    } else {
      groups.set(key, { key, label, documents: [document] });
    }
  }

  if (params.mode === 'status') {
    return TEACHER_DOCUMENT_STATUSES.filter((status) => groups.has(status)).map(
      (status) => groups.get(status)!
    );
  }

  return Array.from(groups.values()).sort((a, b) =>
    params.collator.compare(a.label, b.label)
  );
}

export function collapsedGroupKeysForGroups(
  groups: Array<Pick<TeacherDocumentWorkGroup, 'key'>>
) {
  return new Set(
    groups.filter((group) => group.key !== 'all').map((group) => group.key)
  );
}
