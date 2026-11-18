import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(import.meta.dir, 'migration.sql'), 'utf8');
const PROD_ASSIGNMENT_TYPE_ID = 'cmwma1a58000301l3jqxcxr3j';

describe('free classroom C-E-R bundle migration', () => {
  test('adds the library rubric only when missing (never updates an existing row)', () => {
    expect(sql).toContain(`INSERT INTO "Rubric"`);
    expect(sql).toContain(`"name" = 'c-e-r'`);
    expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM "Rubric" WHERE "name" = \'c-e-r\')');
    expect(sql).not.toMatch(/UPDATE\s+"Rubric"/i);
  });

  test('links only the production assignment type id and is a no-op when that row is absent', () => {
    expect(sql).toContain(PROD_ASSIGNMENT_TYPE_ID);
    expect(sql).toContain(`at."id" = '${PROD_ASSIGNMENT_TYPE_ID}'`);
    expect(sql).not.toMatch(/lower\s*\(\s*trim\s*\(\s*at\."title"\s*\)\s*\)/i);
    expect(sql).toContain(`"kind" = 'claim_evidence_reasoning'`);
  });

  test('grants free orgs like the other bundle types (insert-only, on conflict do nothing)', () => {
    expect(sql).toContain('INSERT INTO "OrganizationAssignmentType"');
    expect(sql).toContain(`o."plan" = 'FREE_CLASSROOM'`);
    expect(sql).toContain(`t."kind" = 'claim_evidence_reasoning'`);
    expect(sql).toContain(
      'ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING'
    );
  });
});