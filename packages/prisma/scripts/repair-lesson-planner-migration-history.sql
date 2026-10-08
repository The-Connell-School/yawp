-- Run on preview Postgres before `prisma migrate deploy` when lesson-planner
-- migrations were re-timestamped (see 20261008000000 migration).

DELETE FROM "_prisma_migrations"
WHERE migration_name IN (
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
  '20261008001100_bootstrap_exit_ticket_assignment_type'
)
AND finished_at IS NULL;

UPDATE "_prisma_migrations" SET migration_name = '20261008000100_add_lesson_planner'
WHERE migration_name = '20261007173800_add_lesson_planner';

UPDATE "_prisma_migrations" SET migration_name = '20261008000200_add_lesson_packet'
WHERE migration_name = '20261007173900_add_lesson_packet';

UPDATE "_prisma_migrations" SET migration_name = '20261008000300_add_lesson_resource_title'
WHERE migration_name = '20261007174000_add_lesson_resource_title';

UPDATE "_prisma_migrations" SET migration_name = '20261008000400_add_lesson_plan_material'
WHERE migration_name = '20261007174100_add_lesson_plan_material';

UPDATE "_prisma_migrations" SET migration_name = '20261008000500_add_lesson_material_slot'
WHERE migration_name = '20261007174200_add_lesson_material_slot';

UPDATE "_prisma_migrations" SET migration_name = '20261008000600_add_lesson_star'
WHERE migration_name = '20261007174300_add_lesson_star';

UPDATE "_prisma_migrations" SET migration_name = '20261008000700_add_lesson_plan_unit'
WHERE migration_name = '20261007174400_add_lesson_plan_unit';

UPDATE "_prisma_migrations" SET migration_name = '20261008000800_add_lesson_published'
WHERE migration_name = '20261007174500_add_lesson_published';

UPDATE "_prisma_migrations" SET migration_name = '20261008000900_add_lesson_material_edited_at'
WHERE migration_name = '20261007174600_add_lesson_material_edited_at';

UPDATE "_prisma_migrations" SET migration_name = '20261008001000_add_exit_ticket_config'
WHERE migration_name = '20261007174700_add_exit_ticket_config';

UPDATE "_prisma_migrations" SET migration_name = '20261008001100_bootstrap_exit_ticket_assignment_type'
WHERE migration_name = '20261007174800_bootstrap_exit_ticket_assignment_type';
