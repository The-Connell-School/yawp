import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import {
  EXIT_TICKET_BOOTSTRAP_IMAGE_MD5,
  EXIT_TICKET_RETIRED_ARTWORK_MD5S,
} from './bootstrap-exit-ticket-assignment-type';

/**
 * The current card: the yellow ticket stub, shipped November 2026. The
 * prod-fidelity fixture and the forward migration carry these exact bytes.
 */
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

function fixtureRow() {
  const row = assignmentTypeImages.find(
    (image) => image.id === 'cexitticketimage000000000'
  );
  expect(row).toBeDefined();
  return row!;
}

function embeddedDecodeB64(sql: string): string {
  const decodeBlock = sql.match(/decode\(\s*([\s\S]*?),\s*'base64'\s*\)/);
  expect(decodeBlock).not.toBeNull();
  return decodeBlock![1]
    .replace(/\s*\|\|\s*/g, '')
    .replace(/'/g, '');
}

function md5OfEmbeddedB64(sql: string): string {
  const blob = Buffer.from(embeddedDecodeB64(sql), 'base64');
  return createHash('md5').update(blob).digest('hex');
}

describe('exit ticket artwork', () => {
  test('fixture image md5 matches the current card', () => {
    const blob = Buffer.from(fixtureRow().blob.base64, 'base64');
    expect(createHash('md5').update(blob).digest('hex')).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
  });

  /**
   * The bootstrap migration already ran in production, so it keeps the bytes
   * it shipped with (the ship-review checksum) rather than being edited after
   * the fact. The current card reaches existing databases through the forward
   * migration, and the seed's retired list covers the rest.
   */
  test('bootstrap migration still embeds the originally applied artwork only (create-only insert)', () => {
    expect(EXIT_TICKET_BOOTSTRAP_IMAGE_MD5).toBe(
      '12e8c7775d7c5ad1ebd01cdffe70f949'
    );
    expect(bootstrapMigrationSql).toContain(EXIT_TICKET_BOOTSTRAP_IMAGE_MD5);
    expect(md5OfEmbeddedB64(bootstrapMigrationSql)).toBe(
      EXIT_TICKET_BOOTSTRAP_IMAGE_MD5
    );
    expect(md5OfEmbeddedB64(bootstrapMigrationSql)).not.toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
    expect(bootstrapMigrationSql).toContain('NOT EXISTS');
    expect(bootstrapMigrationSql).not.toContain('daily_pages');
    expect(bootstrapMigrationSql).not.toContain('class_starter');
  });

  test('forward migration embeds the same fixture bytes as prod-fidelity', () => {
    expect(embeddedDecodeB64(forwardMigrationSql)).toBe(fixtureRow().blob.base64);
    expect(md5OfEmbeddedB64(forwardMigrationSql)).toBe(
      EXIT_TICKET_FIXTURE_IMAGE_MD5
    );
    expect(forwardMigrationSql).toContain('UPDATE "AssignmentTypeImage"');
    expect(forwardMigrationSql).not.toContain('INSERT INTO "AssignmentTypeImage"');
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
