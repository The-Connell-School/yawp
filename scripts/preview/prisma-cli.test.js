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
    expect(deploy).toContain('PRISMA_MIGRATE_PRISMA_CLI_SCRIPT=/preview-control/prisma-cli.sh');
    const toolingSection = deploy.slice(deploy.indexOf('run_tooling_if_needed()'));
    const generateIndex = toolingSection.indexOf('${prisma_cli} generate');
    const migrateIndex = toolingSection.indexOf('${migrate_wrapper}');
    expect(generateIndex).toBeGreaterThan(-1);
    expect(migrateIndex).toBeGreaterThan(generateIndex);
    expect(toolingSection).toContain('&& ${migrate_wrapper} && cd packages/prisma');
  });

  test('wrapper executes Prisma via node build entry', () => {
    const script = readFileSync(join(repoRoot, 'scripts/preview/prisma-cli.sh'), 'utf8');
    expect(script).toContain('PRISMA_CLI_REPO_ROOT');
    expect(script).toContain('REPO_ROOT');
    expect(script).toContain('resolve_repo_root');
    expect(script).toContain('ensure_node');
    expect(script).toContain('NODE_VERSION=22.23.4');
    expect(script).toContain('nodejs.org/dist/v${NODE_VERSION}/');
    expect(script).toContain('sha256sum -c -');
    expect(script).not.toContain('nodesource');
    expect(script).toContain('exec node "$PRISMA_ENTRY"');
    expect(script).toContain('cd "$ROOT/packages/prisma"');
  });
});
