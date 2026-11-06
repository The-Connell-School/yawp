import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import {
  EXIT_TICKET_BOOTSTRAP_IMAGE_MD5,
  EXIT_TICKET_RETIRED_ARTWORK_MD5S,
} from './bootstrap-exit-ticket-assignment-type';

/** The current card: the yellow ticket stub, shipped November 2026. */
export const EXIT_TICKET_FIXTURE_IMAGE_MD5 =
  '4894c384baab7aa9872a85fddc169155';

const migrationSql = readFileSync(
  join(
    import.meta.dirname,
    '../migrations/20261008001100_bootstrap_exit_ticket_assignment_type/migration.sql'
  ),
  'utf8'
);

function fixtureRow() {
  const row = assignmentTypeImages.find(
    (image) => image.id === 'cexitticketimage000000000'
  );
  expect(row).toBeDefined();
  return row!;
}

describe('exit ticket artwork', () => {
  test('fixture image md5 matches the current card', () => {
    const blob = Buffer.from(fixtureRow().blob.base64, 'base64');
    expect(createHash('md5').update(blob).digest('hex')).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
  });

  /**
   * The migration already ran in production, so it keeps the bytes it shipped
   * with (the ship-review checksum) rather than being edited after the fact.
   * The redrawn card reaches production through the retired list below.
   */
  test('migration SQL still embeds the bootstrap bytes (create-only insert)', () => {
    const decodeBlock = migrationSql.match(
      /decode\(\s*([\s\S]*?),\s*'base64'\s*\)/
    );
    expect(decodeBlock).not.toBeNull();
    const embedded = decodeBlock![1]
      .replace(/\s*\|\|\s*/g, '')
      .replace(/'/g, '');

    const blob = Buffer.from(embedded, 'base64');
    expect(createHash('md5').update(blob).digest('hex')).toBe(
      EXIT_TICKET_BOOTSTRAP_IMAGE_MD5
    );
    expect(EXIT_TICKET_BOOTSTRAP_IMAGE_MD5).toBe(
      '12e8c7775d7c5ad1ebd01cdffe70f949'
    );
    expect(migrationSql).toContain('NOT EXISTS');
    expect(migrationSql).not.toContain('daily_pages');
    expect(migrationSql).not.toContain('class_starter');
  });

  test('the bootstrap card is retired, so the seed swaps it for the fixture card', () => {
    expect(EXIT_TICKET_RETIRED_ARTWORK_MD5S).toContain(
      EXIT_TICKET_BOOTSTRAP_IMAGE_MD5
    );
    expect(EXIT_TICKET_RETIRED_ARTWORK_MD5S).not.toContain(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
  });
});
