import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { CLASS_STARTER_THREE_BAND_SCHEMA } from '../../../services/web-app/app/domain/assignment-types/class-starter-three-band-rubric';

const sql = readFileSync(
  path.join(
    import.meta.dir,
    '../migrations/20261101120000_class_starter_three_band_rubric/migration.sql'
  ),
  'utf8'
);

describe('three-band Class Starter rubric migration', () => {
  test('only adds the library rubric; it never updates rubrics or assignment types', () => {
    expect(sql).toContain(`IF EXISTS (SELECT 1 FROM "Rubric" WHERE "name" = 'class-starter-three-band')`);
    expect(sql).not.toMatch(/\bUPDATE\s+"/i);
    expect(sql).not.toMatch(/"AssignmentType"/);
    expect(sql).not.toMatch(/"Assignment"/);
    expect(sql).not.toMatch(/\bDELETE\b/i);
  });

  test('records revision 1 as the current revision so new assignments pin to it', () => {
    expect(sql).toContain('INSERT INTO "RubricRevision"');
    expect(sql).toContain('"currentRevisionId"');
  });

  test('carries exactly the rubric the app defines, so the two cannot drift', () => {
    expect(sql).toContain(
      `'${JSON.stringify(CLASS_STARTER_THREE_BAND_SCHEMA).replace(/'/g, "''")}'::jsonb`
    );
  });
});
