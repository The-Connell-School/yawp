import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../..');

describe('preview prisma-cli', () => {
  test('deploy tooling runs Prisma generate and migrate through Node wrapper', () => {
    const deploy = readFileSync(join(repoRoot, 'scripts/preview/deploy.sh'), 'utf8');
    expect(deploy).toContain('local prisma_cli');
    expect(deploy).toContain('/preview-control/prisma-cli.sh');
    expect(deploy).toContain('scripts/preview/prisma-cli.sh');
    expect(deploy).not.toContain('bun prisma migrate deploy');
    expect(deploy).not.toMatch(/bun prisma generate/);
    expect(deploy).toContain('prisma-migrate-deploy-with-summary.sh');
    expect(deploy).toContain('PRISMA_MIGRATE_PRISMA_CLI=');
    const generateIndex = deploy.indexOf('${prisma_cli} generate');
    const migrateIndex = deploy.indexOf('prisma-migrate-deploy-with-summary.sh');
    expect(generateIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(generateIndex);
    expect(deploy).toContain('prisma-migrate-deploy-with-summary.sh && cd packages/prisma');
  });

  test('wrapper executes Prisma via node build entry', () => {
    const script = readFileSync(join(repoRoot, 'scripts/preview/prisma-cli.sh'), 'utf8');
    expect(script).toContain('PRISMA_CLI_REPO_ROOT');
    expect(script).toContain('REPO_ROOT');
    expect(script).toContain('resolve_repo_root');
    expect(script).toContain('ensure_node');
    expect(script).toContain('setup_22.x');
    expect(script).toContain('exec node "$PRISMA_ENTRY"');
    expect(script).toContain('cd "$ROOT/packages/prisma"');
  });
});
