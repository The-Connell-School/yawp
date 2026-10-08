/**
 * PR previews keep the same Postgres volume across deploys. Renaming applied
 * lesson-planner migrations (20261007173800–748 → 20261008000100–011) would
 * otherwise make Prisma re-apply DDL that already exists. Rewrite history rows
 * only when the old name is recorded and the new name is not.
 */
import { createPrismaClient } from './local-dev/connection';

export const LESSON_PLANNER_MIGRATION_RENAMES: Record<string, string> = {
  '20261007173800_add_lesson_planner': '20261008000100_add_lesson_planner',
  '20261007173900_add_lesson_packet': '20261008000200_add_lesson_packet',
  '20261007174000_add_lesson_resource_title':
    '20261008000300_add_lesson_resource_title',
  '20261007174100_add_lesson_plan_material':
    '20261008000400_add_lesson_plan_material',
  '20261007174200_add_lesson_material_slot':
    '20261008000500_add_lesson_material_slot',
  '20261007174300_add_lesson_star': '20261008000600_add_lesson_star',
  '20261007174400_add_lesson_plan_unit': '20261008000700_add_lesson_plan_unit',
  '20261007174500_add_lesson_published': '20261008000800_add_lesson_published',
  '20261007174600_add_lesson_material_edited_at':
    '20261008000900_add_lesson_material_edited_at',
  '20261007174700_add_exit_ticket_config':
    '20261008001000_add_exit_ticket_config',
  '20261007174800_bootstrap_exit_ticket_assignment_type':
    '20261008001100_bootstrap_exit_ticket_assignment_type',
};

export async function repairLessonPlannerMigrationHistory(
  prisma: ReturnType<typeof createPrismaClient>
) {
  let updated = 0;
  for (const [oldName, newName] of Object.entries(
    LESSON_PLANNER_MIGRATION_RENAMES
  )) {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE migration_name IN (${oldName}, ${newName})
    `;
    const names = new Set(rows.map((row) => row.migration_name));
    if (names.has(newName) || !names.has(oldName)) {
      continue;
    }
    await prisma.$executeRaw`
      UPDATE "_prisma_migrations" SET migration_name = ${newName}
      WHERE migration_name = ${oldName}
    `;
    updated += 1;
  }
  return { updated };
}

if (import.meta.main) {
  const prisma = createPrismaClient();
  repairLessonPlannerMigrationHistory(prisma)
    .then((result) => {
      console.log('repair-lesson-planner-migration-history:', JSON.stringify(result));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
