import { describe, expect, test } from 'bun:test';

import {
  DEFAULT_BLOCKING_TRANSACTION_AGE_MS,
  DEFAULT_MIGRATION_LOCK_TIMEOUT_MS,
  DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MS,
  readMigrationSafetyConfig,
  withProductionMigrationTimeouts,
} from './production-migration-safety';

describe('production migration safety', () => {
  test('enforces bounded production defaults through libpq options', () => {
    const env = withProductionMigrationTimeouts({});

    expect(env.PGOPTIONS).toContain(
      `lock_timeout=${DEFAULT_MIGRATION_LOCK_TIMEOUT_MS}ms`
    );
    expect(env.PGOPTIONS).toContain(
      `statement_timeout=${DEFAULT_MIGRATION_STATEMENT_TIMEOUT_MS}ms`
    );
    expect(readMigrationSafetyConfig({}).blockingTransactionAgeMs).toBe(
      DEFAULT_BLOCKING_TRANSACTION_AGE_MS
    );
  });

  test('preserves existing libpq options and applies configured budgets', () => {
    const env = withProductionMigrationTimeouts({
      PGOPTIONS: '-c application_name=yawp-deploy',
      PROD_MIGRATION_LOCK_TIMEOUT_MS: '2500',
      PROD_MIGRATION_STATEMENT_TIMEOUT_MS: '300000',
      PROD_MIGRATION_BLOCKING_TRANSACTION_AGE_MS: '1000',
    });

    expect(env.PGOPTIONS).toBe(
      '-c application_name=yawp-deploy -c lock_timeout=2500ms -c statement_timeout=300000ms'
    );
    expect(readMigrationSafetyConfig(env)).toEqual({
      lockTimeoutMs: 2500,
      statementTimeoutMs: 300000,
      blockingTransactionAgeMs: 1000,
    });
  });

  test('rejects unsafe timeout input instead of passing it to libpq', () => {
    expect(() =>
      withProductionMigrationTimeouts({
        PROD_MIGRATION_LOCK_TIMEOUT_MS: '0; DROP TABLE users',
      })
    ).toThrow('PROD_MIGRATION_LOCK_TIMEOUT_MS');
    expect(() =>
      readMigrationSafetyConfig({
        PROD_MIGRATION_STATEMENT_TIMEOUT_MS: '0',
      })
    ).toThrow('PROD_MIGRATION_STATEMENT_TIMEOUT_MS');
  });
});
