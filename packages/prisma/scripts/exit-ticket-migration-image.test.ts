import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';

/** Applied bootstrap migration must stay byte-identical to what demo/prod ran. */
export const EXIT_TICKET_BOOTSTRAP_IMAGE_MD5 =
  '12e8c7775d7c5ad1ebd01cdffe70f949';

/** Brian 2026-11-05 artwork carried by fixtures and the forward migration. */
export const EXIT_TICKET_FIXTURE_IMAGE_MD5 =
  '80baf4f9c4276a9d896028c021dcc592';

const bootstrapMigrationSql = readFileSync(
  join(
    import.meta.dirname,
    '../migrations/20261008001100_bootstrap_exit_ticket_assignment_type/migration.sql'
  ),
  'utf8'
);

const forwardMigrationSql = readFileSync(
  join(
    import.meta.dirname,
    '../migrations/20261107120000_update_exit_ticket_assignment_type_image/migration.sql'
  ),
  'utf8'
);

function embeddedDecodeB64(sql: string): string {
  const decodeBlock = sql.match(/decode\(\s*([\s\S]*?),\s*'base64'\s*\)/);
  expect(decodeBlock).not.toBeNull();
  return decodeBlock![1]
    .replace(/\s*\|\|\s*/g, '')
    .replace(/'/g, '');
}

function md5OfEmbeddedB64(sql: string): string {
  const embedded = embeddedDecodeB64(sql);
  const blob = Buffer.from(embedded, 'base64');
  return createHash('md5').update(blob).digest('hex');
}

describe('exit ticket migration artwork', () => {
  test('fixture image md5 matches the forward-migration checksum', () => {
    const row = assignmentTypeImages.find(
      (image) => image.id === 'cexitticketimage000000000'
    );
    expect(row).toBeDefined();
    const blob = Buffer.from(row!.blob.base64, 'base64');
    expect(createHash('md5').update(blob).digest('hex')).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
  });

  test('bootstrap migration still embeds the originally applied artwork only', () => {
    expect(bootstrapMigrationSql).toContain(EXIT_TICKET_BOOTSTRAP_IMAGE_MD5);
    expect(md5OfEmbeddedB64(bootstrapMigrationSql)).toBe(
      EXIT_TICKET_BOOTSTRAP_IMAGE_MD5
    );
    expect(md5OfEmbeddedB64(bootstrapMigrationSql)).not.toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
    expect(bootstrapMigrationSql).not.toContain('daily_pages');
    expect(bootstrapMigrationSql).not.toContain('class_starter');
  });

  test('forward migration embeds the same fixture bytes as prod-fidelity', () => {
    const row = assignmentTypeImages.find(
      (image) => image.id === 'cexitticketimage000000000'
    );
    expect(row).toBeDefined();
    expect(embeddedDecodeB64(forwardMigrationSql)).toBe(row!.blob.base64);
    expect(md5OfEmbeddedB64(forwardMigrationSql)).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
    expect(forwardMigrationSql).toContain('UPDATE "AssignmentTypeImage"');
    expect(forwardMigrationSql).not.toContain('INSERT INTO "AssignmentTypeImage"');
  });
});
