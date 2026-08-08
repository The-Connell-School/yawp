import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const packageRoot = resolve(import.meta.dir, '..');
const schema = readFileSync(resolve(packageRoot, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  resolve(
    packageRoot,
    'migrations/20260806120000_add_seed_generator_persistence/migration.sql'
  ),
  'utf8'
);

describe('seed generator persistence migration', () => {
  test('keeps schema and migration aligned for all three durable models', () => {
    for (const model of [
      'SeedGeneratorConversation',
      'SeedGeneratorMessage',
      'SeedGeneratorNode',
    ]) {
      expect(schema).toContain(`model ${model} {`);
      expect(migration).toContain(`CREATE TABLE "${model}"`);
    }
  });

  test('cascades conversation children and indexes thread ordering/local ids', () => {
    expect(migration).toContain('"SeedGeneratorMessage_conversationId_fkey"');
    expect(migration).toContain('"SeedGeneratorNode_conversationId_fkey"');
    expect(
      migration.match(/ON DELETE CASCADE/g)?.length
    ).toBeGreaterThanOrEqual(4);
    expect(migration).toContain(
      '"SeedGeneratorConversation_membershipId_updatedAt_idx"'
    );
    expect(migration).toContain(
      '"SeedGeneratorNode_conversationId_localId_key"'
    );
  });
});
