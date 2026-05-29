import { describe, expect, test } from 'bun:test';
import { isLocalDatabaseUrl } from './seed-overlay-connection';

describe('isLocalDatabaseUrl', () => {
  test('treats Docker Compose postgres hostname as local non-TLS Postgres', () => {
    expect(
      isLocalDatabaseUrl('postgresql://postgres:postgres@postgres:5432/yawp_preview'),
    ).toBe(true);
  });

  test('treats preview PR-scoped Postgres hostnames as local non-TLS Postgres', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://postgres:postgres@yawp-pr-153-postgres-1:5432/yawp_preview',
      ),
    ).toBe(true);
  });

  test('does not treat RDS URLs as local', () => {
    expect(
      isLocalDatabaseUrl(
        'postgresql://yawp:secret@yawp-prod.abc123.us-east-1.rds.amazonaws.com:5432/yawp',
      ),
    ).toBe(false);
  });
});
