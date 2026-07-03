import { describe, expect, test } from 'bun:test';

import { getDockerPostgresReadyCommand } from './prepare-e2e';

describe('e2e Postgres readiness', () => {
  test('waits for the final TCP listener instead of the bootstrap Unix socket', () => {
    expect(getDockerPostgresReadyCommand('postgres')).toBe(
      "docker exec yawp-e2e-postgres pg_isready -h 127.0.0.1 -p 5432 -U 'postgres'"
    );
  });
});
