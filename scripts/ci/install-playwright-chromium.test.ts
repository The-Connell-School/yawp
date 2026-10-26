import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dir, '../..');
const installScript = path.join(repoRoot, 'scripts/ci/install-playwright-chromium.sh');
const pruneScript = path.join(repoRoot, 'scripts/ci/prune-playwright-browser-cache.sh');
const resolveScript = path.join(repoRoot, 'scripts/ci/resolve-playwright-version.sh');

function runBash(scriptPath: string, args: string[] = [], env?: Record<string, string>) {
  return spawnSync('bash', [scriptPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

test('resolve-playwright-version matches hoisted @playwright/test in bun.lock', () => {
  const resolved = runBash(resolveScript);
  expect(resolved.status).toBe(0);
  const version = resolved.stdout.trim();
  expect(version.length).toBeGreaterThan(0);

  const lock = fs.readFileSync(path.join(repoRoot, 'bun.lock'), 'utf8');
  const matches = lock.match(/"@playwright\/test": \["@playwright\/test@([^"]+)"/g) ?? [];
  expect(matches.length).toBe(1);
  expect(matches[0]).toContain(`@playwright/test@${version}`);
});

test(
  'install-playwright-chromium self-check enforces attempt timeouts',
  () => {
    const result = runBash(installScript, [], {
      PLAYWRIGHT_INSTALL_SELF_CHECK: '1',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('SELF_CHECK: all checks passed');
  },
  { timeout: 30_000 }
);

test('prune-playwright-browser-cache keeps chromium artifacts only', () => {
  const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'yawp-pw-cache-'));
  try {
    fs.mkdirSync(path.join(cacheRoot, 'chromium-1000'), { recursive: true });
    fs.mkdirSync(path.join(cacheRoot, 'chromium-999'), { recursive: true });
    fs.mkdirSync(path.join(cacheRoot, 'chromium_headless_shell-999'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(cacheRoot, 'ffmpeg-1000'), { recursive: true });
    fs.mkdirSync(path.join(cacheRoot, 'firefox-999'), { recursive: true });
    fs.mkdirSync(path.join(cacheRoot, 'webkit-999'), { recursive: true });

    const result = runBash(pruneScript, [], {
      PLAYWRIGHT_BROWSERS_PATH: cacheRoot,
    });
    expect(result.status).toBe(0);

    expect(fs.existsSync(path.join(cacheRoot, 'chromium-1000'))).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, 'chromium-999'))).toBe(false);
    expect(
      fs.existsSync(path.join(cacheRoot, 'chromium_headless_shell-999'))
    ).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, 'ffmpeg-1000'))).toBe(true);
    expect(fs.existsSync(path.join(cacheRoot, 'firefox-999'))).toBe(false);
    expect(fs.existsSync(path.join(cacheRoot, 'webkit-999'))).toBe(false);
  } finally {
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  }
});

test('ci.yml wires Playwright install through bounded helper and cache hardening', () => {
  const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
  const installCalls =
    workflow.match(
      /bash \.\.\/\.\.\/scripts\/ci\/install-playwright-chromium\.sh/g
    ) ?? [];
  expect(installCalls.length).toBe(4);

  const installBlocks = workflow.match(
    /- name: Install Playwright chromium[\s\S]*?(?=\n      - name:)/g
  );
  expect(installBlocks?.length ?? 0).toBe(4);
  for (const block of installBlocks ?? []) {
    expect(block).toContain('timeout-minutes: 28');
    expect(block).toContain('PLAYWRIGHT_INSTALL_ATTEMPT_TIMEOUT: 12m');
    expect(block).toContain('install-playwright-chromium.sh');
  }

  expect(workflow).toContain('prune-playwright-browser-cache.sh');
  expect(workflow).toContain('continue-on-error: true');
  expect(workflow).toContain('id: playwright-cache-save');
});
