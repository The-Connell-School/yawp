import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import assignmentModules from '../fixtures/prod-fidelity/assignment-modules.json';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import assignmentTypes from '../fixtures/prod-fidelity/assignment-types.json';
import { artworkMd5 } from './assignment-type-artwork';

const MIGRATION_DIR = join(
  import.meta.dirname,
  '../migrations/20261115120000_rename_daily_pages_to_short_response'
);
const migrationSql = readFileSync(join(MIGRATION_DIR, 'migration.sql'), 'utf8');
const rollbackSql = readFileSync(join(MIGRATION_DIR, 'rollback.sql'), 'utf8');

/** Brian's Nov 5 card for this type: the cat above a "Class Starter" wordmark. */
const CLASS_STARTER_WORDMARK_CARD_MD5 = 'de6553790d16191d326bbde20b893ced';

const card = readFileSync(join(import.meta.dir, 'assets', 'short-response.jpg'));

/** One statement: from its `-- name` header to the next one. */
function statementFor(name: string): string {
  const start = migrationSql.indexOf(`\n-- ${name}\n`);
  expect(start).toBeGreaterThan(-1);
  const next = migrationSql.indexOf('\n\n-- ', start + 1);
  return migrationSql.slice(start, next === -1 ? undefined : next);
}

const shortResponse = assignmentTypes.find((type) => type.kind === 'daily_pages')!;

/**
 * Daily Pages became Short Response on Nov 15. Production gets the name and
 * the card from this migration; previews and local databases load the
 * prod-fidelity fixture after migrating, so the fixture has to agree with it.
 */
describe('Daily Pages to Short Response migration', () => {
  test('renames the type only while it is still called Daily Pages', () => {
    const sql = statementFor('title');
    expect(sql).toContain('UPDATE "AssignmentType"');
    expect(sql).toContain(`"title" = 'Short Response'`);
    expect(sql).toContain(`"kind" = 'daily_pages'`);
    expect(sql).toContain(`AND "title" = 'Daily Pages'`);
  });

  test('renames the module under it the same way', () => {
    const sql = statementFor('module');
    expect(sql).toContain('UPDATE "AssignmentModule"');
    expect(sql).toContain(`t."kind" = 'daily_pages'`);
    expect(sql).toContain(`AND m."title" = 'Daily Pages'`);
  });

  test('carries the new card and replaces only the Class Starter wordmark card', () => {
    const sql = statementFor('card');
    const match = sql.match(/decode\(\s*'([A-Za-z0-9+/=]+)',\s*'base64'\s*\)/);
    expect(match).not.toBeNull();
    expect(Buffer.from(match![1], 'base64').equals(card)).toBe(true);

    expect(sql).toContain('UPDATE "AssignmentTypeImage"');
    expect(sql).not.toContain('INSERT INTO');
    expect(sql).toContain(`t."kind" = 'daily_pages'`);
    const named = [...sql.matchAll(/'([0-9a-f]{32})'/g)].map((m) => m[1]);
    expect(named).toEqual([CLASS_STARTER_WORDMARK_CARD_MD5]);
    expect(named).not.toContain(artworkMd5(card));
  });

  test('never writes rows, changes kinds, or touches work under the type', () => {
    expect(migrationSql).not.toMatch(/INSERT INTO|DELETE FROM|"kind" =\s*'short/);
    expect(migrationSql).not.toMatch(/UPDATE "(Assignment|Submission|Document|Rubric)"/);
  });

  test('the rollback puts the old name back', () => {
    expect(rollbackSql).toContain(`"title" = 'Daily Pages'`);
    expect(rollbackSql).toContain(`AND "title" = 'Short Response'`);
    expect(rollbackSql).toContain(`AND m."title" = 'Short Response'`);
  });

  test('the fixture agrees: the name, the module and the card', () => {
    expect(shortResponse.title).toBe('Short Response');
    const modules = assignmentModules.filter(
      (module) => module.assignmentTypeId === shortResponse.id
    );
    expect(modules.map((module) => module.title)).toEqual(['Short Response']);

    const image = assignmentTypeImages.find(
      (row) => row.assignmentTypeId === shortResponse.id
    )!;
    expect(Buffer.from(image.blob.base64, 'base64').equals(card)).toBe(true);
    expect(image.contentType).toBe('image/jpeg');
    expect(migrationSql).toContain(`"altText" = '${image.altText}'`);
  });

  test('no card in the fixture still says Class Starter', () => {
    const md5s = assignmentTypeImages.map((row) =>
      artworkMd5(Buffer.from(row.blob.base64, 'base64'))
    );
    expect(md5s).not.toContain(CLASS_STARTER_WORDMARK_CARD_MD5);
  });
});
