import { describe, expect, test } from 'bun:test';
import { getNextAssignmentModuleId } from './assignment-module-navigation';

const modules = [
  { id: 'module-1', position: 1 },
  { id: 'module-2', position: 2 },
  { id: 'module-3', position: 3 },
];

describe('getNextAssignmentModuleId', () => {
  test('uses the live CMS module instead of a stale loader next module id', () => {
    expect(
      getNextAssignmentModuleId(
        {
          assignmentModuleId: 'module-2',
          assignmentModule: {
            id: 'module-2',
            position: 2,
            assignmentType: { assignmentModules: modules },
          },
        },
        'module-2'
      )
    ).toBe('module-3');
  });

  test('does not keep a stale next module enabled when the live CMS is last', () => {
    expect(
      getNextAssignmentModuleId(
        {
          assignmentModuleId: 'module-3',
          assignmentModule: {
            id: 'module-3',
            position: 3,
            assignmentType: { assignmentModules: modules },
          },
        },
        'module-2'
      )
    ).toBeUndefined();
  });

  test('falls back to the loader next module id when live module metadata is absent', () => {
    expect(getNextAssignmentModuleId({}, 'module-2')).toBe('module-2');
  });
});
