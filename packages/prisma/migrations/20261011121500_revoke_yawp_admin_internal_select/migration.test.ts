import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('revoke_yawp_admin_internal_select migration', () => {
  const sql = readFileSync(
    join(import.meta.dir, 'migration.sql'),
    'utf8'
  );

  test('revokes SELECT for yawp_admin on internal schema objects idempotently', () => {
    expect(sql).toContain("table_schema = 'internal'");
    expect(sql).toContain('REVOKE SELECT ON %I.%I FROM yawp_admin');
    expect(sql).toContain('undefined_table');
    expect(sql).toContain('yawp_internal');
    expect(sql).toContain('public."Organization"');
  });
});
