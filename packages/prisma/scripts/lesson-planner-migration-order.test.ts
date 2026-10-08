import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');
const MAIN_HEAD = '20261007235900_free_classroom_assignment_kind_usage';
const HISTORY_REPAIR_MIGRATION =
  '20261008000000_repair_lesson_planner_migration_history';

const LESSON_PLANNER_MIGRATIONS = [
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
];

describe('lesson planner migration order', () => {
  test('lesson planner migrations sort after main head and include rollback.sql', () => {
    const names = readdirSync(MIGRATIONS_DIR);
    expect(names).toContain(MAIN_HEAD);
    expect(names).toContain(HISTORY_REPAIR_MIGRATION);
    expect(HISTORY_REPAIR_MIGRATION > MAIN_HEAD).toBe(true);
    expect(LESSON_PLANNER_MIGRATIONS[0]! > HISTORY_REPAIR_MIGRATION).toBe(true);
    for (const migration of LESSON_PLANNER_MIGRATIONS) {
      expect(names).toContain(migration);
      expect(migration > MAIN_HEAD).toBe(true);
      expect(
        readdirSync(join(MIGRATIONS_DIR, migration)).includes('rollback.sql')
      ).toBe(true);
    }
    const sorted = [...LESSON_PLANNER_MIGRATIONS].sort();
    expect(sorted).toEqual(LESSON_PLANNER_MIGRATIONS);
  });
});
