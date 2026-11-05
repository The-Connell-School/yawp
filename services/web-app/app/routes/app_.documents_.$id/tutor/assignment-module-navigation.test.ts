import { describe, expect, test } from 'bun:test';
import {
  getAssignmentModuleIdForCmsIdx,
  getNextAssignmentModuleId,
  getPreviousAssignmentModuleId,
} from './assignment-module-navigation';

const modules = [
  { id: 'module-1', position: 1 },
  { id: 'module-2', position: 2 },
  { id: 'module-3', position: 3 },
];

/** Thesis-Driven Essay: Welcome soft-deleted at position 0 (prod-fidelity fixture). */
const thesisDrivenModulesWithDeletedWelcome = [
  {
    id: 'welcome-deleted',
    position: 0,
    deletedAt: '2026-02-06T10:52:21.691Z',
  },
  { id: 'prewriting', position: 1, deletedAt: null },
  { id: 'thesis', position: 2, deletedAt: null },
];

function cmsOnModule(
  moduleId: string,
  assignmentModules: typeof thesisDrivenModulesWithDeletedWelcome
) {
  const module = assignmentModules.find((m) => m.id === moduleId)!;
  return {
    assignmentModuleId: moduleId,
    assignmentModule: {
      id: moduleId,
      position: module.position,
      assignmentType: { assignmentModules },
    },
  };
}

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

describe('thesis-driven essay welcome module (soft-deleted)', () => {
  test('forward from pre-writing reaches thesis statement, not welcome', () => {
    expect(
      getNextAssignmentModuleId(
        cmsOnModule('prewriting', thesisDrivenModulesWithDeletedWelcome)
      )
    ).toBe('thesis');
  });

  test('backward from thesis statement returns to pre-writing, never welcome', () => {
    expect(
      getPreviousAssignmentModuleId(
        cmsOnModule('thesis', thesisDrivenModulesWithDeletedWelcome)
      )
    ).toBe('prewriting');
  });

  test('cmsIdx maps to navigable modules only (not unfiltered assignmentModules)', () => {
    const cms = cmsOnModule(
      'thesis',
      thesisDrivenModulesWithDeletedWelcome
    );
    // Student on thesis at cmsIdx=1 in [prewriting, thesis] sessions; back uses idx 0.
    expect(getAssignmentModuleIdForCmsIdx(cms, 0)).toBe('prewriting');
    expect(getAssignmentModuleIdForCmsIdx(cms, 0)).not.toBe('welcome-deleted');
  });
});
