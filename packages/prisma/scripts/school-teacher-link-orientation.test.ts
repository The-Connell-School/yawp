import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationPath = join(
  import.meta.dirname,
  '../migrations/20260616143000_backfill_school_teacher_links/migration.sql'
);

describe('school teacher link orientation', () => {
  test('backfill migration writes Prisma implicit join columns as membership then school', () => {
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ct."B" AS "A"');
    expect(sql).toContain('c."schoolId" AS "B"');
    expect(sql).toContain('FOREIGN KEY ("A") REFERENCES "OrgMembership"("id")');
    expect(sql).toContain('FOREIGN KEY ("B") REFERENCES "School"("id")');
  });

  test('seed scripts use membership-school order for raw _SchoolTeachers inserts', () => {
    const repoRoot = join(import.meta.dirname, '../../..');
    const rawInsertFiles = [
      'services/web-app/e2e/seed-e2e.ts',
      'services/web-app/e2e/db-helpers.ts',
      'packages/prisma/scripts/local-dev/seed-synthetic-data.ts',
      'packages/prisma/scripts/seed-overlay.ts',
    ];

    for (const file of rawInsertFiles) {
      const source = readFileSync(join(repoRoot, file), 'utf8');
      expect(source).not.toContain('VALUES (${school.id}, ${teacherMembership');
      expect(source).not.toContain('VALUES (${schoolId}, ${teacherMembership');
    }
  });
});
