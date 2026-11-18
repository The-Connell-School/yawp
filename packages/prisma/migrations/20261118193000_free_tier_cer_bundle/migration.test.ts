import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(import.meta.dir, 'migration.sql'), 'utf8');

describe('free classroom C-E-R bundle migration', () => {
  test('seeds library rubric, links prod type, and grants free orgs', () => {
    expect(sql).toContain(`"name" = 'c-e-r'`);
    expect(sql).toContain(`"kind" = 'claim_evidence_reasoning'`);
    expect(sql).toContain('cmwma1a58000301l3jqxcxr3j');
    expect(sql).toContain('INSERT INTO "OrganizationAssignmentType"');
    expect(sql).toContain(
      'ON CONFLICT ("organizationId", "assignmentTypeId") DO NOTHING'
    );
  });
});