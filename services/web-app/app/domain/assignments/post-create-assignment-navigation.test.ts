import { describe, expect, test } from 'bun:test';
import {
  resolvePostCreateAssignmentNavigation,
  safeInAppNavigationTarget,
} from './post-create-assignment-navigation';

describe('safeInAppNavigationTarget', () => {
  test('rejects external and new-assignment paths', () => {
    expect(safeInAppNavigationTarget('https://evil.test')).toBeNull();
    expect(safeInAppNavigationTarget('/app/assignments/new')).toBeNull();
    expect(
      safeInAppNavigationTarget('/app/assignments/new?assignmentTypeId=x')
    ).toBeNull();
  });

  test('allows in-app teacher destinations', () => {
    expect(safeInAppNavigationTarget('/app')).toBe('/app');
    expect(safeInAppNavigationTarget('/app/assignments')).toBe(
      '/app/assignments'
    );
    expect(safeInAppNavigationTarget('/app/assignment-types/at-1')).toBe(
      '/app/assignment-types/at-1'
    );
  });
});

describe('resolvePostCreateAssignmentNavigation', () => {
  test('first assignment still opens the home celebration', () => {
    expect(
      resolvePostCreateAssignmentNavigation({
        assignmentId: 'a-1',
        priorAssignmentCount: 0,
        classId: 'c-1',
        exitTo: '/app/assignments',
        canGoBack: true,
      })
    ).toEqual({
      kind: 'navigate',
      url: '/app?firstAssignment=a-1&firstAssignmentClassId=c-1',
    });
  });

  test('prefers exitTo over history back', () => {
    expect(
      resolvePostCreateAssignmentNavigation({
        assignmentId: 'a-1',
        priorAssignmentCount: 2,
        classId: 'c-1',
        exitTo: '/app/assignment-types/thesis',
        canGoBack: true,
      })
    ).toEqual({ kind: 'navigate', url: '/app/assignment-types/thesis' });
  });

  test('uses history back when exitTo is missing', () => {
    expect(
      resolvePostCreateAssignmentNavigation({
        assignmentId: 'a-1',
        priorAssignmentCount: 2,
        classId: 'c-1',
        exitTo: null,
        canGoBack: true,
      })
    ).toEqual({ kind: 'back' });
  });

  test('falls back to assignment detail when there is no exit context', () => {
    expect(
      resolvePostCreateAssignmentNavigation({
        assignmentId: 'a-9',
        priorAssignmentCount: 2,
        classId: 'c-1',
        exitTo: null,
        canGoBack: false,
      })
    ).toEqual({ kind: 'navigate', url: '/app/assignments/a-9' });
  });
});
