import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.join(import.meta.dir, '../..');
const scriptPath = path.join(repoRoot, 'scripts/ci/bun-install-frozen.sh');

function runScript(
  env: Record<string, string>,
  extraEnv?: NodeJS.ProcessEnv
) {
  return spawnSync('bash', [scriptPath], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv, ...env },
  });
}

test('bun-install-frozen self-check enforces attempt timeouts', () => {
  const result = runScript({
    BUN_INSTALL_SELF_CHECK: '1',
    BUN_INSTALL_ATTEMPT_TIMEOUT: '2s',
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('SELF_CHECK: bun-install-frozen timing checks passed');
});

test(
  'bun-install-frozen retries once on stall but not on immediate lockfile failure',
  () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'yawp-bun-install-ci-'));
  try {
    const bin = path.join(fixture, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const log = path.join(fixture, 'invocations.log');
    fs.writeFileSync(
      path.join(bin, 'bun'),
      `#!/usr/bin/env bash
set -eu
echo "invoke $*" >> "$BUN_INSTALL_INVOCATIONS"
if [[ "$1" == "install" ]]; then
  if [[ ! -f "$BUN_INSTALL_STALL_ONCE" ]]; then
    touch "$BUN_INSTALL_STALL_ONCE"
    sleep 120
    exit 0
  fi
  exit 0
fi
exit 99
`,
      { mode: 0o755 }
    );

    const stallOnce = path.join(fixture, 'stall-once');
    const hang = runScript(
      {
        BUN_INSTALL_ATTEMPT_TIMEOUT: '1s',
        BUN_INSTALL_RETRY_BACKOFF_SECONDS: '0',
        BUN_INSTALL_INVOCATIONS: log,
        BUN_INSTALL_STALL_ONCE: stallOnce,
      },
      { PATH: `${bin}:${process.env.PATH}` }
    );
    expect(hang.status).toBe(0);
    expect(fs.readFileSync(log, 'utf8').trim().split('\n').length).toBe(2);

    fs.writeFileSync(log, '');
    fs.rmSync(stallOnce, { force: true });
    fs.writeFileSync(
      path.join(bin, 'bun'),
      `#!/usr/bin/env bash
set -eu
echo "invoke $*" >> "$BUN_INSTALL_INVOCATIONS"
if [[ "$1" == "install" ]]; then
  echo "lockfile mismatch" >&2
  exit 1
fi
exit 99
`,
      { mode: 0o755 }
    );

    const lockfileFail = runScript(
      {
        BUN_INSTALL_ATTEMPT_TIMEOUT: '5s',
        BUN_INSTALL_INVOCATIONS: log,
      },
      { PATH: `${bin}:${process.env.PATH}` }
    );
    expect(lockfileFail.status).toBe(1);
    expect(fs.readFileSync(log, 'utf8').trim().split('\n').length).toBe(1);
    const combined = `${lockfileFail.stdout}\n${lockfileFail.stderr}`;
    expect(combined).toContain('not retrying non-timeout failures');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  },
  { timeout: 30_000 }
);

test('CI workflow routes frozen bun install through the bounded helper', () => {
  const workflow = fs.readFileSync(
    path.join(repoRoot, '.github/workflows/ci.yml'),
    'utf8'
  );
  expect(workflow).toContain('bash scripts/ci/bun-install-frozen.sh');
  expect(workflow).not.toMatch(
    /name: 📦 Install dependencies[\s\S]*?run: bun install --frozen-lockfile/m
  );
  expect(workflow).toMatch(
    /name: 📦 Install dependencies[\s\S]*?timeout-minutes: 22/m
  );
});
