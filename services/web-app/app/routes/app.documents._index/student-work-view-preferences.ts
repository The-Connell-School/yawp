import {
  TEACHER_DOCUMENT_STATUSES,
  type TeacherDocumentStatus,
} from '~/utils/teacher-document-status';
import {
  parseDocumentGroupMode,
  type DocumentGroupMode,
} from '~/utils/teacher-document-work-grouping';
import {
  parseDocumentWorkFilterIds,
  serializeDocumentWorkFilterIds,
} from '~/utils/teacher-document-work-filter-options';
import {
  parseDocumentWorkSort,
  type DocumentWorkSort,
} from '~/utils/teacher-document-work-sort';
import {
  parseWritingSignalFilter,
  type WritingSignalFilter,
} from '~/utils/paste-alert-summary.server';

import {
  getStoredCollapsedDocumentGroups,
  withStoredCollapsedDocumentGroups,
} from '../app.my-classes.$classId/class-documents-view-preferences';

export type StudentWorkViewPreferences = {
  studentIds?: string[];
  classIds?: string[];
  assignmentIds?: string[];
  status?: TeacherDocumentStatus;
  documentGroup?: Exclude<DocumentGroupMode, 'none'>;
  collapsedGroups?: Partial<
    Record<Exclude<DocumentGroupMode, 'none'>, string[]>
  >;
  documentSort?: DocumentWorkSort;
  writingSignal?: Exclude<WritingSignalFilter, 'all'>;
};

export const STUDENT_WORK_VIEW_STORAGE_KEY = 'yawp.student-work-view';

const DOCUMENT_GROUP_MODES = ['class', 'student', 'assignment', 'status'] as const;

function parseIdListPreference(
  parsed: Record<string, unknown>,
  pluralKey: 'studentIds' | 'classIds' | 'assignmentIds',
  singularKey: 'studentId' | 'classId' | 'assignmentId'
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
): StudentWorkViewPreferences['collapsedGroups'] {
  if (!value || typeof value !== 'object') return undefined;

  const collapsedGroups: NonNullable<
    StudentWorkViewPreferences['collapsedGroups']
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

export {
  getStoredCollapsedDocumentGroups as getStoredCollapsedStudentWorkGroups,
  withStoredCollapsedDocumentGroups as withStoredCollapsedStudentWorkGroups,
};

export function parseStudentWorkViewPreferences(
  raw: string | null | undefined
): StudentWorkViewPreferences {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const preferences: StudentWorkViewPreferences = {};

    preferences.studentIds = parseIdListPreference(
      parsed,
      'studentIds',
      'studentId'
    );
    preferences.classIds = parseIdListPreference(parsed, 'classIds', 'classId');
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

export function serializeStudentWorkViewPreferences(
  preferences: StudentWorkViewPreferences
) {
  return JSON.stringify(preferences);
}

export function readStudentWorkViewPreferences(): StudentWorkViewPreferences {
  if (typeof window === 'undefined') return {};

  return parseStudentWorkViewPreferences(
    window.localStorage.getItem(STUDENT_WORK_VIEW_STORAGE_KEY)
  );
}

export function writeStudentWorkViewPreferences(
  preferences: StudentWorkViewPreferences
) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      STUDENT_WORK_VIEW_STORAGE_KEY,
      serializeStudentWorkViewPreferences(preferences)
    );
  } catch {
    // Ignore storage failures.
  }
}

function applyStudentWorkSearchParamsToPreferences(
  searchParams: URLSearchParams,
  existing: StudentWorkViewPreferences
): StudentWorkViewPreferences {
  const next: StudentWorkViewPreferences = { ...existing };

  const studentIds = parseDocumentWorkFilterIds(searchParams.get('student'));
  if (studentIds.length > 0) {
    next.studentIds = studentIds;
  } else {
    delete next.studentIds;
  }

  const classIds = parseDocumentWorkFilterIds(searchParams.get('class'));
  if (classIds.length > 0) {
    next.classIds = classIds;
  } else {
    delete next.classIds;
  }

  const assignmentIds = parseDocumentWorkFilterIds(
    searchParams.get('assignment')
  );
  if (assignmentIds.length > 0) {
    next.assignmentIds = assignmentIds;
  } else {
    delete next.assignmentIds;
  }

  const status = searchParams.get('status');
  if (
    status &&
    status !== 'all' &&
    TEACHER_DOCUMENT_STATUSES.includes(status as TeacherDocumentStatus)
  ) {
    next.status = status as TeacherDocumentStatus;
  } else {
    delete next.status;
  }

  const documentGroup = parseDocumentGroupMode(searchParams.get('group'));
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

export function mergeStudentWorkViewPreferences(
  searchParams: URLSearchParams,
  updates: Partial<StudentWorkViewPreferences> = {}
) {
  const base = applyStudentWorkSearchParamsToPreferences(
    searchParams,
    readStudentWorkViewPreferences()
  );

  writeStudentWorkViewPreferences({
    ...base,
    ...updates,
    collapsedGroups: updates.collapsedGroups ?? base.collapsedGroups,
    documentSort: updates.documentSort ?? base.documentSort,
  });
}

export function preferencesFromStudentWorkSearchParams(
  searchParams: URLSearchParams
): StudentWorkViewPreferences {
  const preferences: StudentWorkViewPreferences = {};
  const studentIds = parseDocumentWorkFilterIds(searchParams.get('student'));
  const classIds = parseDocumentWorkFilterIds(searchParams.get('class'));
  const assignmentIds = parseDocumentWorkFilterIds(
    searchParams.get('assignment')
  );
  const status = searchParams.get('status');
  const documentGroup = parseDocumentGroupMode(searchParams.get('group'));

  if (studentIds.length > 0) preferences.studentIds = studentIds;
  if (classIds.length > 0) preferences.classIds = classIds;
  if (assignmentIds.length > 0) preferences.assignmentIds = assignmentIds;
  if (
    status &&
    status !== 'all' &&
    TEACHER_DOCUMENT_STATUSES.includes(status as TeacherDocumentStatus)
  ) {
    preferences.status = status as TeacherDocumentStatus;
  }
  if (documentGroup !== 'none') {
    preferences.documentGroup = documentGroup;
  }

  return preferences;
}

export function mergeStoredStudentWorkSearchParams(params: {
  searchParams: URLSearchParams;
  storedPreferences: StudentWorkViewPreferences;
}) {
  const next = new URLSearchParams(params.searchParams.toString());
  let shouldReplace = false;

  if (!next.has('student') && params.storedPreferences.studentIds?.length) {
    const serialized = serializeDocumentWorkFilterIds(
      params.storedPreferences.studentIds
    );
    if (serialized) {
      next.set('student', serialized);
      shouldReplace = true;
    }
  }

  if (!next.has('class') && params.storedPreferences.classIds?.length) {
    const serialized = serializeDocumentWorkFilterIds(
      params.storedPreferences.classIds
    );
    if (serialized) {
      next.set('class', serialized);
      shouldReplace = true;
    }
  }

  if (!next.has('assignment') && params.storedPreferences.assignmentIds?.length) {
    const serialized = serializeDocumentWorkFilterIds(
      params.storedPreferences.assignmentIds
    );
    if (serialized) {
      next.set('assignment', serialized);
      shouldReplace = true;
    }
  }

  if (!next.has('status') && params.storedPreferences.status) {
    next.set('status', params.storedPreferences.status);
    shouldReplace = true;
  }

  if (!next.has('group') && params.storedPreferences.documentGroup) {
    next.set('group', params.storedPreferences.documentGroup);
    shouldReplace = true;
  }

  if (!next.has('writingSignal') && params.storedPreferences.writingSignal) {
    next.set('writingSignal', params.storedPreferences.writingSignal);
    shouldReplace = true;
  }

  return { searchParams: next, shouldReplace };
}
