import {
  TEACHER_DOCUMENT_STATUSES,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  parseDocumentWorkFilterIds,
  serializeDocumentWorkFilterIds,
} from '~/utils/teacher-document-work-filter-options';
import {
  parseDocumentWorkSort,
  type DocumentWorkSort,
} from '~/utils/teacher-document-work-sort';

import {
  parseDocumentGroupMode,
  type DocumentGroupMode,
} from './class-documents-grouping';
import {
  parseWritingSignalFilter,
  type WritingSignalFilter,
} from '~/utils/paste-alert-summary.server';

export type ClassDocumentsViewPreferences = {
  studentIds?: string[];
  assignmentIds?: string[];
  status?: TeacherDocumentStatus;
  documentGroup?: Exclude<DocumentGroupMode, 'none'>;
  collapsedGroups?: Partial<
    Record<Exclude<DocumentGroupMode, 'none'>, string[]>
  >;
  documentSort?: DocumentWorkSort;
  writingSignal?: Exclude<WritingSignalFilter, 'all'>;
};

const DOCUMENT_GROUP_MODES = ['class', 'student', 'assignment', 'status'] as const;

function parseIdListPreference(
  parsed: Record<string, unknown>,
  pluralKey: 'studentIds' | 'assignmentIds',
  singularKey: 'studentId' | 'assignmentId'
): string[] | undefined {
  const pluralValue = parsed[pluralKey];
  if (Array.isArray(pluralValue)) {
    const ids = pluralValue.filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    );
    return ids.length > 0 ? ids : undefined;
  }

  const singularValue = parsed[singularKey];
  if (typeof singularValue === 'string' && singularValue.length > 0) {
    const ids = parseDocumentWorkFilterIds(singularValue);
    return ids.length > 0 ? ids : undefined;
  }

  return undefined;
}

function parseCollapsedGroups(
  value: unknown
): ClassDocumentsViewPreferences['collapsedGroups'] {
  if (!value || typeof value !== 'object') return undefined;

  const collapsedGroups: NonNullable<
    ClassDocumentsViewPreferences['collapsedGroups']
  > = {};

  for (const mode of DOCUMENT_GROUP_MODES) {
    const keys = (value as Record<string, unknown>)[mode];
    if (!Array.isArray(keys)) continue;

    const validKeys = keys.filter(
      (key): key is string => typeof key === 'string' && key.length > 0
    );
    if (validKeys.length > 0) {
      collapsedGroups[mode] = validKeys;
    }
  }

  return Object.keys(collapsedGroups).length > 0 ? collapsedGroups : undefined;
}

export function getStoredCollapsedDocumentGroups(
  preferences: ClassDocumentsViewPreferences,
  documentGroup: Exclude<DocumentGroupMode, 'none'>
) {
  return new Set(preferences.collapsedGroups?.[documentGroup] ?? []);
}

export function withStoredCollapsedDocumentGroups(
  preferences: ClassDocumentsViewPreferences,
  documentGroup: Exclude<DocumentGroupMode, 'none'>,
  collapsedGroupKeys: Iterable<string>
): ClassDocumentsViewPreferences {
  const collapsedKeys = [...collapsedGroupKeys];
  const collapsedGroups = {
    ...preferences.collapsedGroups,
    [documentGroup]: collapsedKeys,
  };

  if (collapsedKeys.length === 0) {
    delete collapsedGroups[documentGroup];
  }

  return {
    ...preferences,
    collapsedGroups:
      Object.keys(collapsedGroups).length > 0 ? collapsedGroups : undefined,
  };
}

export const CLASS_DOCUMENTS_VIEW_STORAGE_KEY = 'yawp.class-documents-view';

export function getClassDocumentsViewStorageKey() {
  return CLASS_DOCUMENTS_VIEW_STORAGE_KEY;
}

export function parseClassDocumentsViewPreferences(
  raw: string | null | undefined
): ClassDocumentsViewPreferences {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferences: ClassDocumentsViewPreferences = {};

    preferences.studentIds = parseIdListPreference(
      parsed,
      'studentIds',
      'studentId'
    );
    preferences.assignmentIds = parseIdListPreference(
      parsed,
      'assignmentIds',
      'assignmentId'
    );

    if (
      typeof parsed.status === 'string' &&
      TEACHER_DOCUMENT_STATUSES.includes(parsed.status as TeacherDocumentStatus)
    ) {
      preferences.status = parsed.status as TeacherDocumentStatus;
    }

    const documentGroup = parseDocumentGroupMode(
      typeof parsed.documentGroup === 'string' ? parsed.documentGroup : null
    );
    if (documentGroup !== 'none') {
      preferences.documentGroup = documentGroup;
    }

    preferences.collapsedGroups = parseCollapsedGroups(parsed.collapsedGroups);
    preferences.documentSort = parseDocumentWorkSort(parsed.documentSort);

    const writingSignal = parseWritingSignalFilter(
      typeof parsed.writingSignal === 'string' ? parsed.writingSignal : null
    );
    if (writingSignal !== 'all') {
      preferences.writingSignal = writingSignal;
    }

    return preferences;
  } catch {
    return {};
  }
}

export function serializeClassDocumentsViewPreferences(
  preferences: ClassDocumentsViewPreferences
) {
  return JSON.stringify(preferences);
}

export function readClassDocumentsViewPreferences(): ClassDocumentsViewPreferences {
  if (typeof window === 'undefined') return {};

  return parseClassDocumentsViewPreferences(
    window.localStorage.getItem(getClassDocumentsViewStorageKey())
  );
}

export function writeClassDocumentsViewPreferences(
  preferences: ClassDocumentsViewPreferences
) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      getClassDocumentsViewStorageKey(),
      serializeClassDocumentsViewPreferences(preferences)
    );
  } catch {
    // Ignore storage failures.
  }
}

function applyClassDocumentsSearchParamsToPreferences(
  searchParams: URLSearchParams,
  existing: ClassDocumentsViewPreferences
): ClassDocumentsViewPreferences {
  const next: ClassDocumentsViewPreferences = { ...existing };

  const studentIds = parseDocumentWorkFilterIds(searchParams.get('studentId'));
  if (studentIds.length > 0) {
    next.studentIds = studentIds;
  } else {
    delete next.studentIds;
  }

  const assignmentIds = parseDocumentWorkFilterIds(
    searchParams.get('assignmentId')
  );
  if (assignmentIds.length > 0) {
    next.assignmentIds = assignmentIds;
  } else {
    delete next.assignmentIds;
  }

  const status = searchParams.get('status');
  if (
    status &&
    TEACHER_DOCUMENT_STATUSES.includes(status as TeacherDocumentStatus)
  ) {
    next.status = status as TeacherDocumentStatus;
  } else {
    delete next.status;
  }

  const documentGroup = parseDocumentGroupMode(searchParams.get('documentGroup'));
  if (documentGroup !== 'none') {
    next.documentGroup = documentGroup;
  } else {
    delete next.documentGroup;
  }

  const writingSignal = parseWritingSignalFilter(
    searchParams.get('writingSignal')
  );
  if (writingSignal !== 'all') {
    next.writingSignal = writingSignal;
  } else {
    delete next.writingSignal;
  }

  return next;
}

export function mergeClassDocumentsViewPreferences(
  searchParams: URLSearchParams,
  updates: Partial<ClassDocumentsViewPreferences> = {}
) {
  const base = applyClassDocumentsSearchParamsToPreferences(
    searchParams,
    readClassDocumentsViewPreferences()
  );

  writeClassDocumentsViewPreferences({
    ...base,
    ...updates,
    collapsedGroups: updates.collapsedGroups ?? base.collapsedGroups,
    documentSort: updates.documentSort ?? base.documentSort,
  });
}

export function preferencesFromSearchParams(
  searchParams: URLSearchParams
): ClassDocumentsViewPreferences {
  const preferences: ClassDocumentsViewPreferences = {};
  const studentIds = parseDocumentWorkFilterIds(searchParams.get('studentId'));
  const assignmentIds = parseDocumentWorkFilterIds(
    searchParams.get('assignmentId')
  );
  const status = searchParams.get('status');
  const documentGroup = parseDocumentGroupMode(searchParams.get('documentGroup'));
  const writingSignal = parseWritingSignalFilter(
    searchParams.get('writingSignal')
  );

  if (studentIds.length > 0) preferences.studentIds = studentIds;
  if (assignmentIds.length > 0) preferences.assignmentIds = assignmentIds;
  if (
    status &&
    TEACHER_DOCUMENT_STATUSES.includes(status as TeacherDocumentStatus)
  ) {
    preferences.status = status as TeacherDocumentStatus;
  }
  if (documentGroup !== 'none') {
    preferences.documentGroup = documentGroup;
  }
  if (writingSignal !== 'all') {
    preferences.writingSignal = writingSignal;
  }

  return preferences;
}

export function mergeStoredClassDocumentsSearchParams(params: {
  searchParams: URLSearchParams;
  storedPreferences: ClassDocumentsViewPreferences;
}) {
  const next = new URLSearchParams(params.searchParams.toString());
  let shouldReplace = false;

  if (!next.has('studentId') && params.storedPreferences.studentIds?.length) {
    const serialized = serializeDocumentWorkFilterIds(
      params.storedPreferences.studentIds
    );
    if (serialized) {
      next.set('studentId', serialized);
      shouldReplace = true;
    }
  }

  if (!next.has('assignmentId') && params.storedPreferences.assignmentIds?.length) {
    const serialized = serializeDocumentWorkFilterIds(
      params.storedPreferences.assignmentIds
    );
    if (serialized) {
      next.set('assignmentId', serialized);
      shouldReplace = true;
    }
  }

  if (!next.has('status') && params.storedPreferences.status) {
    next.set('status', params.storedPreferences.status);
    shouldReplace = true;
  }

  if (!next.has('documentGroup') && params.storedPreferences.documentGroup) {
    next.set('documentGroup', params.storedPreferences.documentGroup);
    shouldReplace = true;
  }

  if (!next.has('writingSignal') && params.storedPreferences.writingSignal) {
    next.set('writingSignal', params.storedPreferences.writingSignal);
    shouldReplace = true;
  }

  return { searchParams: next, shouldReplace };
}
