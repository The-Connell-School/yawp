import { describe, expect, test } from 'bun:test';
import { buildPrismaPgPoolConfig } from './local-dev/connection';

describe('seed-free-tier-bundle-assignment-types connection', () => {
  test('uses TLS when running through the production migration tunnel', () => {
    expect(
      buildPrismaPgPoolConfig(
        'postgresql://yawp:secret@localhost:3306/yawp',
        { REMOTE_MIGRATE_TUNNEL: '1' }
      )
    ).toEqual({
      connectionString: 'postgresql://yawp:secret@localhost:3306/yawp',
      ssl: { rejectUnauthorized: false },
    });
  });

  test('keeps local migration validation non-TLS', () => {
    expect(
      buildPrismaPgPoolConfig(
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
        {}
      )
    ).toEqual({
      connectionString:
        'postgresql://postgres:postgres@127.0.0.1:5432/yawp_migration_ci',
      ssl: false,
    });
  });
});
