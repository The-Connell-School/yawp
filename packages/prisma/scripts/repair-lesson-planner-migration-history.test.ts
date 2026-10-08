import { describe, expect, test } from 'bun:test';
import { LESSON_PLANNER_MIGRATION_RENAMES } from './repair-lesson-planner-migration-history';

describe('repair-lesson-planner-migration-history', () => {
  test('maps all eleven retired folders to post-#414 timestamps', () => {
    const newNames = Object.values(LESSON_PLANNER_MIGRATION_RENAMES).sort();
    expect(newNames).toEqual([
      '20261008000100_add_lesson_planner',
      '20261008000200_add_lesson_packet',
      '20261008000300_add_lesson_resource_title',
      '20261008000400_add_lesson_plan_material',
      '20261008000500_add_lesson_material_slot',
      '20261008000600_add_lesson_star',
      '20261008000700_add_lesson_plan_unit',
      '20261008000800_add_lesson_published',
      '20261008000900_add_lesson_material_edited_at',
      '20261008001000_add_exit_ticket_config',
      '20261008001100_bootstrap_exit_ticket_assignment_type',
    ]);
    expect(
      newNames.every(
        (name) => name > '20261007235900_free_classroom_assignment_kind_usage'
      )
    ).toBe(true);
  });
});
