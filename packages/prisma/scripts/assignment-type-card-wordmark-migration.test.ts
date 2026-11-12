import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import { artworkMd5 } from './assignment-type-artwork';
import {
  BUNDLE_RETIRED_ARTWORK_MD5S,
  BUNDLE_TILE_IMAGES,
} from './seed-free-tier-bundle-assignment-types';
import { CLASS_STARTER_KIND } from './seed-class-starter-assignment-type';

const PREWRITING_KIND = 'prewriting';
const THESIS_STATEMENT_KIND = 'thesis_statement';

const migrationSql = readFileSync(
  join(
    import.meta.dirname,
    '../migrations/20261112120000_drop_wordmark_from_assignment_type_cards/migration.sql'
  ),
  'utf8'
);

/** The UPDATE for one kind: from its `-- kind` header to the next one. */
function statementFor(kind: string): string {
  const start = migrationSql.indexOf(`\n-- ${kind}\n`);
  expect(start).toBeGreaterThan(-1);
  const next = migrationSql.indexOf('\n-- ', start + 1);
  return migrationSql.slice(start, next === -1 ? undefined : next);
}

function embeddedBlob(sql: string): Buffer {
  const match = sql.match(/decode\(\s*'([A-Za-z0-9+/=]+)',\s*'base64'\s*\)/);
  expect(match).not.toBeNull();
  return Buffer.from(match![1], 'base64');
}

function currentCard(kind: string): Buffer {
  return readFileSync(join(import.meta.dir, 'assets', BUNDLE_TILE_IMAGES[kind].file));
}

/**
 * Production does not run the card seeds, so the wordmark-free cards reach it
 * through this migration. Each statement has to carry the bytes and alt text
 * the seeds ship, and only replace cards Yawp drew.
 */
describe('wordmark-free card migration', () => {
  const kinds = [CLASS_STARTER_KIND, PREWRITING_KIND, THESIS_STATEMENT_KIND];

  test.each(kinds)('%s carries the seed asset and alt text', (kind) => {
    const sql = statementFor(kind);
    expect(embeddedBlob(sql).equals(currentCard(kind))).toBe(true);
    expect(sql).toContain(`"altText" = '${BUNDLE_TILE_IMAGES[kind].altText}'`);
    expect(sql).toContain('UPDATE "AssignmentTypeImage"');
    expect(sql).not.toContain('INSERT INTO');
  });

  test.each(kinds)('%s only replaces cards the seed has retired', (kind) => {
    const sql = statementFor(kind);
    const retired = BUNDLE_RETIRED_ARTWORK_MD5S[kind];
    const named = [...sql.matchAll(/'([0-9a-f]{32})'/g)].map((m) => m[1]);

    expect(named.length).toBeGreaterThan(0);
    for (const md5 of named) expect(retired).toContain(md5);
    expect(named).not.toContain(artworkMd5(currentCard(kind)));
  });

  /**
   * In production "The Thesis-Driven Essay" shows the same wordmark card as
   * the Thesis Statement type. The prod-fidelity fixture carries the redrawn
   * card so previews (which load the fixture after migrating) match.
   */
  test('the Thesis-Driven Essay fixture carries the redrawn thesis card', () => {
    const row = assignmentTypeImages.find(
      (image) => image.assignmentTypeId === 'clxiepcvs0004h87lutw2n5lt'
    );
    expect(row).toBeDefined();
    const blob = Buffer.from(row!.blob.base64, 'base64');
    expect(blob.equals(currentCard(THESIS_STATEMENT_KIND))).toBe(true);
  });
});
