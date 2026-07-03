import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const migrationPath = join(
  import.meta.dirname,
  '../migrations/20260703195500_realign_teacher_training_assignments/migration.sql'
);

const testWithDatabase = process.env.DATABASE_URL ? test : test.skip;

async function resetFixture(client: pg.Client) {
  await client.query('DROP TABLE IF EXISTS "_TeacherTrainingAssignments"');
  await client.query('DROP TABLE IF EXISTS "TeacherTraining"');
  await client.query('DROP TABLE IF EXISTS "OrgMembership"');
}

describe('teacher training assignment migration', () => {
  testWithDatabase('swaps existing implicit join rows without nulling either column', async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    const migrationSql = readFileSync(migrationPath, 'utf8');

    await client.connect();
    try {
      await resetFixture(client);
      await client.query('CREATE TABLE "OrgMembership" ("id" TEXT PRIMARY KEY)');
      await client.query('CREATE TABLE "TeacherTraining" ("id" TEXT PRIMARY KEY)');
      await client.query(`
        CREATE TABLE "_TeacherTrainingAssignments" (
          "A" TEXT NOT NULL,
          "B" TEXT NOT NULL,
          CONSTRAINT "_TeacherTrainingAssignments_AB_pkey" PRIMARY KEY ("A", "B"),
          CONSTRAINT "_TeacherTrainingAssignments_A_fkey"
            FOREIGN KEY ("A") REFERENCES "TeacherTraining"("id")
            ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "_TeacherTrainingAssignments_B_fkey"
            FOREIGN KEY ("B") REFERENCES "OrgMembership"("id")
            ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await client.query('INSERT INTO "OrgMembership" ("id") VALUES ($1)', [
        'membership-1',
      ]);
      await client.query('INSERT INTO "TeacherTraining" ("id") VALUES ($1)', [
        'training-1',
      ]);
      await client.query(
        'INSERT INTO "_TeacherTrainingAssignments" ("A", "B") VALUES ($1, $2)',
        ['training-1', 'membership-1']
      );

      await client.query(migrationSql);

      const rows = await client.query(
        'SELECT "A", "B" FROM "_TeacherTrainingAssignments"'
      );
      expect(rows.rows).toEqual([{ A: 'membership-1', B: 'training-1' }]);

      const constraints = await client.query<{ column_name: string; referenced_table: string }>(`
        SELECT
          key_usage.column_name,
          constraint_info.confrelid::regclass::text AS referenced_table
        FROM information_schema.key_column_usage AS key_usage
        JOIN pg_constraint AS constraint_info
          ON constraint_info.conname = key_usage.constraint_name
        WHERE key_usage.table_name = '_TeacherTrainingAssignments'
          AND key_usage.column_name IN ('A', 'B')
          AND constraint_info.contype = 'f'
        ORDER BY key_usage.column_name
      `);

      expect(constraints.rows).toEqual([
        { column_name: 'A', referenced_table: '"OrgMembership"' },
        { column_name: 'B', referenced_table: '"TeacherTraining"' },
      ]);
    } finally {
      await resetFixture(client);
      await client.end();
    }
  });
});
