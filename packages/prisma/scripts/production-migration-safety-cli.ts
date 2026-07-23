#!/usr/bin/env bun

import {
  assertNoBlockingMigrationTransactions,
  withProductionMigrationTimeouts,
} from './production-migration-safety';

try {
  const env = withProductionMigrationTimeouts(process.env);
  await assertNoBlockingMigrationTransactions(env);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
