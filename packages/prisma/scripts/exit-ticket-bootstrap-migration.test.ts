import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const migrationSql = readFileSync(
  join(
    import.meta.dirname,
    '../migrations/20261007174800_bootstrap_exit_ticket_assignment_type/migration.sql'
  ),
  'utf8'
);

const testWithDatabase = process.env.DATABASE_URL ? test : test.skip;

describe('exit ticket bootstrap migration', () => {
  testWithDatabase(
    'is idempotent on the migrated CI database and creates no school/teacher grants',
    async () => {
      const client = new pg.Client({
        connectionString: process.env.DATABASE_URL,
      });
      await client.connect();
      try {
        const typeRow = await client.query<{ id: string }>(
          `SELECT "id" FROM "AssignmentType" WHERE "kind" = 'exit_ticket' LIMIT 1`
        );
        expect(typeRow.rowCount).toBe(1);
        const typeId = typeRow.rows[0]!.id;

        const snapshot = async () => {
          const orgGrants = await client.query(
            `SELECT COUNT(*)::int AS c FROM "OrganizationAssignmentType" WHERE "assignmentTypeId" = $1`,
            [typeId]
          );
          const schoolGrants = await client.query(
            `SELECT COUNT(*)::int AS c FROM "SchoolAssignmentType" WHERE "assignmentTypeId" = $1`,
            [typeId]
          );
          const teacherGrants = await client.query(
            `SELECT COUNT(*)::int AS c FROM "TeacherAssignmentType" WHERE "assignmentTypeId" = $1`,
            [typeId]
          );
          const modules = await client.query(
            `SELECT COUNT(*)::int AS c FROM "AssignmentModule" WHERE "assignmentTypeId" = $1`,
            [typeId]
          );
          const images = await client.query(
            `SELECT COUNT(*)::int AS c FROM "AssignmentTypeImage" WHERE "assignmentTypeId" = $1`,
            [typeId]
          );
          return {
            orgGrants: orgGrants.rows[0]!.c,
            schoolGrants: schoolGrants.rows[0]!.c,
            teacherGrants: teacherGrants.rows[0]!.c,
            modules: modules.rows[0]!.c,
            images: images.rows[0]!.c,
          };
        };

        const before = await snapshot();
        expect(before.schoolGrants).toBe(0);
        expect(before.teacherGrants).toBe(0);

        await client.query(migrationSql);
        const afterFirst = await snapshot();
        await client.query(migrationSql);
        const afterSecond = await snapshot();

        expect(afterSecond).toEqual(afterFirst);
        expect(afterSecond.schoolGrants).toBe(0);
        expect(afterSecond.teacherGrants).toBe(0);
      } finally {
        await client.end();
      }
    }
  );
});
