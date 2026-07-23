import { describe, expect, test } from 'bun:test';

import {
  mergeStoredStudentWorkSearchParams,
  mergeStudentWorkViewPreferences,
  parseStudentWorkViewPreferences,
  preferencesFromStudentWorkSearchParams,
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
      writingSignal: 'unreviewed',
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
      writingSignal: 'unreviewed',
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
      'student=student-1,student-2&class=class-1&assignment=assignment-1,assignment-2&status=graded&group=student&writingSignal=any&q=essay'
    );

    expect(preferencesFromStudentWorkSearchParams(params)).toEqual({
      studentIds: ['student-1', 'student-2'],
      classIds: ['class-1'],
      assignmentIds: ['assignment-1', 'assignment-2'],
      status: 'graded',
      documentGroup: 'student',
      writingSignal: 'any',
    });
  });

  test('extracts both non-default writing signal modes', () => {
    expect(
      preferencesFromStudentWorkSearchParams(
        new URLSearchParams('writingSignal=any')
      )
    ).toEqual({ writingSignal: 'any' });
    expect(
      preferencesFromStudentWorkSearchParams(
        new URLSearchParams('writingSignal=unreviewed')
      )
    ).toEqual({ writingSignal: 'unreviewed' });
    expect(
      preferencesFromStudentWorkSearchParams(
        new URLSearchParams('writingSignal=all')
      )
    ).toEqual({});
  });

  test('merges stored preferences into missing search params', () => {
    const merged = mergeStoredStudentWorkSearchParams({
      searchParams: new URLSearchParams(),
      storedPreferences: {
        studentIds: ['student-1', 'student-2'],
        classIds: ['class-1'],
        status: 'needs-grading',
        documentGroup: 'status',
        writingSignal: 'unreviewed',
      },
    });

    expect(merged.shouldReplace).toBe(true);
    expect(merged.searchParams.get('student')).toBe('student-1,student-2');
    expect(merged.searchParams.get('class')).toBe('class-1');
    expect(merged.searchParams.get('status')).toBe('needs-grading');
    expect(merged.searchParams.get('group')).toBe('status');
    expect(merged.searchParams.get('writingSignal')).toBe('unreviewed');
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
          writingSignal: 'unreviewed',
        })
      );

      mergeStudentWorkViewPreferences(
        new URLSearchParams('status=graded&writingSignal=any')
      );

      expect(
        parseStudentWorkViewPreferences(
          storage.get(STUDENT_WORK_VIEW_STORAGE_KEY)
        )
      ).toEqual({
        status: 'graded',
        writingSignal: 'any',
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
