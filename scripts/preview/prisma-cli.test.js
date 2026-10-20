import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../..');

describe('preview prisma-cli', () => {
  test('deploy tooling runs Prisma generate and migrate through Node wrapper', () => {
    const deploy = readFileSync(join(repoRoot, 'scripts/preview/deploy.sh'), 'utf8');
    expect(deploy).toContain('bash scripts/preview/prisma-cli.sh');
    expect(deploy).not.toContain('bun prisma migrate deploy');
    expect(deploy).not.toMatch(/bun prisma generate/);
    expect(deploy).toContain(
      '(bash scripts/preview/prisma-cli.sh migrate deploy || bash scripts/preview/prisma-cli.sh migrate deploy)'
    );
    const generateIndex = deploy.indexOf('scripts/preview/prisma-cli.sh generate');
    const migrateIndex = deploy.indexOf('scripts/preview/prisma-cli.sh migrate deploy');
    expect(generateIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(generateIndex);
  });

  test('wrapper executes Prisma via node build entry', () => {
    const script = readFileSync(join(repoRoot, 'scripts/preview/prisma-cli.sh'), 'utf8');
    expect(script).toContain('ensure_node');
    expect(script).toContain('setup_22.x');
    expect(script).toContain('exec node "$PRISMA_ENTRY"');
  });
});
