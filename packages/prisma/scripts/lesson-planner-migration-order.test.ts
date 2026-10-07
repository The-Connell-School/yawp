import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'migrations');
const MAIN_HEAD = '20261007173700_assignments_grading_mode_default_bands';

const LESSON_PLANNER_MIGRATIONS = [
  '20261007173800_add_lesson_planner',
  '20261007173900_add_lesson_packet',
  '20261007174000_add_lesson_resource_title',
  '20261007174100_add_lesson_plan_material',
  '20261007174200_add_lesson_material_slot',
  '20261007174300_add_lesson_star',
  '20261007174400_add_lesson_plan_unit',
  '20261007174500_add_lesson_published',
  '20261007174600_add_lesson_material_edited_at',
  '20261007174700_add_exit_ticket_config',
];

describe('lesson planner migration order', () => {
  test('lesson planner migrations sort after main head and include rollback.sql', () => {
    const names = readdirSync(MIGRATIONS_DIR);
    expect(names).toContain(MAIN_HEAD);
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
