import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
);
const setupScript = path.join(repoRoot, 'scripts', 'worktree-local-setup.sh');

/**
 * Render the worktree `.env` files the way the setup script does, without
 * touching Docker or the real worktree. The script returns early when
 * WORKTREE_SETUP_SOURCE_ONLY is set, so a test can source it and call one
 * function.
 */
function renderWebAppEnv(overrides: Record<string, string> = {}): string {
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yawp-worktree-'));
  fs.mkdirSync(path.join(fakeRoot, 'packages', 'prisma'), { recursive: true });
  fs.mkdirSync(path.join(fakeRoot, 'services', 'web-app'), { recursive: true });

  const env = {
    SLUG: 'demo-worktree',
    DATABASE_URL: 'postgresql://postgres:password@127.0.0.1:54321/yawp_demo',
    DEV_PORT: '5176',
    LTI_MOCK_PORT: '9473',
    CONFIG_FILE: path.join(fakeRoot, 'config.env'),
    ...overrides,
  };

  const result = spawnSync(
    'bash',
    [
      '-c',
      `set -euo pipefail
       WORKTREE_SETUP_SOURCE_ONLY=1 source "${setupScript}"
       ROOT="${fakeRoot}"
       write_env_files`,
    ],
    {
      encoding: 'utf8',
      env: { ...process.env, ...env, ROOT: fakeRoot },
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `write_env_files failed (${result.status}): ${result.stderr}`
    );
  }

  const contents = fs.readFileSync(
    path.join(fakeRoot, 'services', 'web-app', '.env'),
    'utf8'
  );
  fs.rmSync(fakeRoot, { recursive: true, force: true });
  return contents;
}

describe('worktree local dev environment', () => {
  test('keeps the existing local dev settings', () => {
    const contents = renderWebAppEnv();

    expect(contents).toContain('NODE_ENV=development');
    expect(contents).toContain('CLASS_INSIGHT_MOCK_MODE=fixture');
    expect(contents).toContain(
      'DATABASE_URL="postgresql://postgres:password@127.0.0.1:54321/yawp_demo"'
    );
  });

  // Without these three the admin Marketing tab never renders and every
  // /app/admin/marketing-media route answers 404, so a developer running the
  // app locally cannot see the studio at all.
  test('turns the Marketing Studio on for local development', () => {
    const contents = renderWebAppEnv();

    expect(contents).toContain('MARKETING_STUDIO_ENABLED=on');
    expect(contents).toContain('MARKETING_RENDER_TARGET_IS_DEMO=confirmed');
  });

  test('points the studio at this worktree, not a shared environment', () => {
    const contents = renderWebAppEnv({ DEV_PORT: '5199' });

    expect(contents).toContain(
      'MARKETING_RENDER_TARGET_URL="http://localhost:5199"'
    );
  });

  test('stores render output on disk so local runs need no S3 credentials', () => {
    const contents = renderWebAppEnv();

    expect(contents).toMatch(/^MARKETING_MEDIA_DIR=".+"$/m);
    expect(contents).toContain('MARKETING_MEDIA_STORAGE=disk');
  });
});
