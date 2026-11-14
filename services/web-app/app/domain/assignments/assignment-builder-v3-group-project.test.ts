import { describe, expect, test } from 'bun:test';
import { assignmentBuilderV3ShowGroupProjectToggle } from './assignment-builder-v3-group-project';

describe('assignmentBuilderV3ShowGroupProjectToggle', () => {
  test('hides when the type does not support group work', () => {
    expect(
      assignmentBuilderV3ShowGroupProjectToggle({
        collaborationSupported: false,
        isEdit: false,
        editingCollaborationEnabled: false,
      })
    ).toBe(false);
  });

  test('shows on create for collaboration-supported types', () => {
    expect(
      assignmentBuilderV3ShowGroupProjectToggle({
        collaborationSupported: true,
        isEdit: false,
        editingCollaborationEnabled: false,
      })
    ).toBe(true);
  });

  test('only shows on edit when the assignment was already collaborative', () => {
    expect(
      assignmentBuilderV3ShowGroupProjectToggle({
        collaborationSupported: true,
        isEdit: true,
        editingCollaborationEnabled: false,
      })
    ).toBe(false);
    expect(
      assignmentBuilderV3ShowGroupProjectToggle({
        collaborationSupported: true,
        isEdit: true,
        editingCollaborationEnabled: true,
      })
    ).toBe(true);
  });
});
