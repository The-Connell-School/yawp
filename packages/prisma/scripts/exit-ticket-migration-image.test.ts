import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';

export const EXIT_TICKET_FIXTURE_IMAGE_MD5 =
  '12e8c7775d7c5ad1ebd01cdffe70f949';

const migrationSql = readFileSync(
  join(
    import.meta.dirname,
    '../migrations/20261007174800_bootstrap_exit_ticket_assignment_type/migration.sql'
  ),
  'utf8'
);

describe('exit ticket migration artwork', () => {
  test('fixture image md5 matches the ship-review checksum', () => {
    const row = assignmentTypeImages.find(
      (image) => image.id === 'cexitticketimage000000000'
    );
    expect(row).toBeDefined();
    const blob = Buffer.from(row!.blob.base64, 'base64');
    expect(createHash('md5').update(blob).digest('hex')).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
  });

  test('migration SQL embeds the same fixture bytes (create-only insert)', () => {
    const row = assignmentTypeImages.find(
      (image) => image.id === 'cexitticketimage000000000'
    );
    expect(row).toBeDefined();
    const fixtureB64 = row!.blob.base64;

    const decodeBlock = migrationSql.match(
      /decode\(\s*([\s\S]*?),\s*'base64'\s*\)/
    );
    expect(decodeBlock).not.toBeNull();
    const embedded = decodeBlock![1]
      .replace(/\s*\|\|\s*/g, '')
      .replace(/'/g, '');
    expect(embedded).toBe(fixtureB64);

    const blob = Buffer.from(embedded, 'base64');
    expect(createHash('md5').update(blob).digest('hex')).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
    expect(migrationSql).not.toContain('daily_pages');
    expect(migrationSql).not.toContain('class_starter');
  });
});
