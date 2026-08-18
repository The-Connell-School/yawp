import { describe, expect, test } from 'bun:test';

import {
  clearStoredStudentWorkFilters,
  mergeStoredStudentWorkSearchParams,
  mergeStudentWorkViewPreferences,
  parseStudentWorkViewPreferences,
  preferencesFromStudentWorkSearchParams,
  stripStudentWorkResetParam,
  STUDENT_WORK_RESET_PARAM,
  STUDENT_WORK_VIEW_STORAGE_KEY,
} from './student-work-view-preferences';

describe('student work view preferences', () => {
  test('uses a dedicated storage key separate from class documents', () => {
    expect(STUDENT_WORK_VIEW_STORAGE_KEY).toBe('yawp.student-work-view');
    expect(STUDENT_WORK_VIEW_STORAGE_KEY).not.toContain('class-documents');
  });

  test('round-trips supported filter and grouping values', () => {
    const serialized = JSON.stringify({
      studentIds: ['student-1', 'student-2'],
      classIds: ['class-1'],
      assignmentIds: ['assignment-1'],
      status: 'needs-grading',
      documentGroup: 'class',
      documentSort: { field: 'student', direction: 'asc' },
      collapsedGroups: {
        class: ['class-1'],
      },
    });

    expect(parseStudentWorkViewPreferences(serialized)).toEqual({
      studentIds: ['student-1', 'student-2'],
      classIds: ['class-1'],
      assignmentIds: ['assignment-1'],
      status: 'needs-grading',
      documentGroup: 'class',
      documentSort: { field: 'student', direction: 'asc' },
      collapsedGroups: {
        class: ['class-1'],
      },
    });
  });

  test('supports legacy singular filter ids in storage', () => {
    const serialized = JSON.stringify({
      studentId: 'student-1',
      classId: 'class-1',
      assignmentId: 'assignment-1',
    });

    expect(parseStudentWorkViewPreferences(serialized)).toEqual({
      studentIds: ['student-1'],
      classIds: ['class-1'],
      assignmentIds: ['assignment-1'],
    });
  });

  test('extracts preferences from student work search params', () => {
    const params = new URLSearchParams(
      'student=student-1,student-2&class=class-1&assignment=assignment-1,assignment-2&status=graded&group=student&q=essay'
    );

    expect(preferencesFromStudentWorkSearchParams(params)).toEqual({
      studentIds: ['student-1', 'student-2'],
      classIds: ['class-1'],
      assignmentIds: ['assignment-1', 'assignment-2'],
      status: 'graded',
      documentGroup: 'student',
    });
  });

  test('merges stored preferences into missing search params', () => {
    const merged = mergeStoredStudentWorkSearchParams({
      searchParams: new URLSearchParams(),
      storedPreferences: {
        studentIds: ['student-1', 'student-2'],
        classIds: ['class-1'],
        status: 'needs-grading',
        documentGroup: 'status',
      },
    });

    expect(merged.shouldReplace).toBe(true);
    expect(merged.searchParams.get('student')).toBe('student-1,student-2');
    expect(merged.searchParams.get('class')).toBe('class-1');
    expect(merged.searchParams.get('status')).toBe('needs-grading');
    expect(merged.searchParams.get('group')).toBe('status');
  });

  test('clears stored filters removed from the URL', () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      storage.set(
        STUDENT_WORK_VIEW_STORAGE_KEY,
        JSON.stringify({
          studentIds: ['student-1'],
          classIds: ['class-1'],
          assignmentIds: ['assignment-1'],
          status: 'needs-grading',
          documentGroup: 'student',
        })
      );

      mergeStudentWorkViewPreferences(new URLSearchParams('status=graded'));

      expect(
        parseStudentWorkViewPreferences(
          storage.get(STUDENT_WORK_VIEW_STORAGE_KEY)
        )
      ).toEqual({
        status: 'graded',
      });

      mergeStudentWorkViewPreferences(new URLSearchParams());

      expect(
        parseStudentWorkViewPreferences(
          storage.get(STUDENT_WORK_VIEW_STORAGE_KEY)
        )
      ).toEqual({});
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  test('a reset link ignores the stored filters and drops the marker', () => {
    const merged = mergeStoredStudentWorkSearchParams({
      searchParams: new URLSearchParams(
        `status=needs-grading&${STUDENT_WORK_RESET_PARAM}=1`
      ),
      storedPreferences: {
        studentIds: ['student-1'],
        classIds: ['class-1'],
        assignmentIds: ['assignment-1'],
        status: 'graded',
        documentGroup: 'class',
      },
    });

    expect(merged.shouldReplace).toBe(true);
    expect(merged.searchParams.get('status')).toBe('needs-grading');
    expect(merged.searchParams.has('student')).toBe(false);
    expect(merged.searchParams.has('class')).toBe(false);
    expect(merged.searchParams.has('assignment')).toBe(false);
    expect(merged.searchParams.has('group')).toBe(false);
    expect(merged.searchParams.has(STUDENT_WORK_RESET_PARAM)).toBe(false);
  });

  test('stripStudentWorkResetParam keeps every other param', () => {
    const stripped = stripStudentWorkResetParam(
      new URLSearchParams(
        `status=needs-grading&group=student&${STUDENT_WORK_RESET_PARAM}=1`
      )
    );

    expect(stripped.get('status')).toBe('needs-grading');
    expect(stripped.get('group')).toBe('student');
    expect(stripped.has(STUDENT_WORK_RESET_PARAM)).toBe(false);
  });

  test('clearStoredStudentWorkFilters keeps sort and collapsed groups', () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      storage.set(
        STUDENT_WORK_VIEW_STORAGE_KEY,
        JSON.stringify({
          studentIds: ['student-1'],
          classIds: ['class-1'],
          assignmentIds: ['assignment-1'],
          status: 'needs-grading',
          documentGroup: 'class',
          documentSort: { field: 'student', direction: 'asc' },
          collapsedGroups: { class: ['class-1'] },
        })
      );

      clearStoredStudentWorkFilters();

      expect(
        parseStudentWorkViewPreferences(storage.get(STUDENT_WORK_VIEW_STORAGE_KEY))
      ).toEqual({
        documentSort: { field: 'student', direction: 'asc' },
        collapsedGroups: { class: ['class-1'] },
      });
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  test('mergeStudentWorkViewPreferences preserves document sort', () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      mergeStudentWorkViewPreferences(new URLSearchParams('group=status'), {
        documentSort: { field: 'status', direction: 'asc' },
      });

      mergeStudentWorkViewPreferences(
        new URLSearchParams('group=status&status=needs-grading')
      );

      expect(
        parseStudentWorkViewPreferences(
          storage.get(STUDENT_WORK_VIEW_STORAGE_KEY)
        )
      ).toEqual({
        documentGroup: 'status',
        status: 'needs-grading',
        documentSort: { field: 'status', direction: 'asc' },
      });
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  test('mergeStudentWorkViewPreferences preserves collapsed groups', () => {
    const storage = new Map<string, string>();
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        localStorage: {
          getItem: (key: string) => storage.get(key) ?? null,
          setItem: (key: string, value: string) => {
            storage.set(key, value);
          },
        },
      },
    });

    try {
      mergeStudentWorkViewPreferences(new URLSearchParams('group=status'), {
        collapsedGroups: {
          status: ['graded'],
        },
      });

      mergeStudentWorkViewPreferences(
        new URLSearchParams('group=status&status=needs-grading')
      );

      expect(
        parseStudentWorkViewPreferences(
          storage.get(STUDENT_WORK_VIEW_STORAGE_KEY)
        )
      ).toEqual({
        documentGroup: 'status',
        status: 'needs-grading',
        collapsedGroups: {
          status: ['graded'],
        },
      });
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
