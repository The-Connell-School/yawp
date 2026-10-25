import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../..');

describe('preview prisma-cli control mount contract', () => {
  test('invoking wrapper from a control mount path still resolves the application repo root', () => {
    const controlDir = mkdtempSync(join(tmpdir(), 'yawp-preview-control-'));
    try {
      cpSync(
        join(repoRoot, 'scripts/preview/prisma-cli.sh'),
        join(controlDir, 'prisma-cli.sh')
      );
      chmodSync(join(controlDir, 'prisma-cli.sh'), 0o755);
      const result = Bun.spawnSync({
        cmd: ['bash', join(controlDir, 'prisma-cli.sh')],
        cwd: tmpdir(),
        env: {
          ...process.env,
          PREVIEW_PRISMA_CLI_PRINT_REPO_ROOT: '1',
          PRISMA_CLI_REPO_ROOT: repoRoot,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(result.exitCode).toBe(0);
      expect(new TextDecoder().decode(result.stdout).trim()).toBe(repoRoot);
    } finally {
      rmSync(controlDir, { recursive: true, force: true });
    }
  });

  test('PR deploy tooling invokes reviewed migrate wrapper from /preview-control', () => {
    const deploy = readFileSync(join(repoRoot, 'scripts/preview/deploy.sh'), 'utf8');
    expect(deploy).toContain(
      'bash /preview-control/prisma-migrate-deploy-with-summary.sh'
    );
    expect(deploy).toContain('PRISMA_MIGRATE_PRISMA_CLI_SCRIPT=/preview-control/prisma-cli.sh');
    expect(deploy).toContain(
      'PRISMA_MIGRATE_SUMMARY_SCRIPT=/preview-control/emit-prisma-migrate-summary.mjs'
    );
    expect(deploy).not.toContain('PRISMA_MIGRATE_PRISMA_CLI=');
  });

  test('PR deploy tooling invokes reviewed prisma-cli from /preview-control', () => {
    const deploy = readFileSync(join(repoRoot, 'scripts/preview/deploy.sh'), 'utf8');
    const compose = readFileSync(
      join(repoRoot, 'scripts/preview/render-compose.mjs'),
      'utf8'
    );

    expect(deploy).toContain(
      "prisma_cli='PRISMA_CLI_REPO_ROOT=/app bash /preview-control/prisma-cli.sh'"
    );
    expect(deploy).toContain("prisma_cli='bash scripts/preview/prisma-cli.sh'");
    expect(deploy).toContain('[[ "$SLUG" =~ ^pr-[1-9][0-9]*$ ]]');
    expect(deploy).not.toMatch(
      /toolbox bash -lc "bash scripts\/preview\/prisma-cli\.sh/
    );
    expect(compose).toContain('/preview-control:ro');
    expect(compose).toContain('toolboxControlVolume = env.prNumber');
  });
});
