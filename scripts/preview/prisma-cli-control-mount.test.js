import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dir, '../..');

describe('preview prisma-cli control mount contract', () => {
  test('PR deploy tooling invokes reviewed prisma-cli from /preview-control', () => {
    const deploy = readFileSync(join(repoRoot, 'scripts/preview/deploy.sh'), 'utf8');
    const compose = readFileSync(
      join(repoRoot, 'scripts/preview/render-compose.mjs'),
      'utf8'
    );

    expect(deploy).toContain("prisma_cli='bash /preview-control/prisma-cli.sh'");
    expect(deploy).toContain("prisma_cli='bash scripts/preview/prisma-cli.sh'");
    expect(deploy).toContain('[[ "$SLUG" =~ ^pr-[1-9][0-9]*$ ]]');
    expect(deploy).not.toMatch(
      /toolbox bash -lc "bash scripts\/preview\/prisma-cli\.sh/
    );
    expect(compose).toContain('/preview-control:ro');
    expect(compose).toContain('toolboxControlVolume = env.prNumber');
  });
});
