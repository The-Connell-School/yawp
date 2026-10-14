import { afterEach, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const roots = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-idle-')); roots.push(root);
  for (const [pr, human, deploy, pinned] of [[100, 1, 1, true], [101, 1, 250000, false], [102, 250000, 1, false], [103, 1, 1, false]]) {
    const dir = path.join(root, 'previews', `pr-${pr}`); mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'docker-compose.yml'), 'services:\n  web: {}\n  renderer: {}\n');
    writeFileSync(path.join(dir, 'last-human-activity'), `${human}\n`);
    writeFileSync(path.join(dir, 'last-deploy'), `${deploy}\n`);
    writeFileSync(path.join(dir, 'last-request'), '399999\n'); // Polling/wake leases must not extend human idle deadlines.
    if (pinned) writeFileSync(path.join(dir, 'keep-awake'), 'true\n');
  }
  mkdirSync(path.join(root, 'inflight', 'pr-103'), { recursive: true });
  writeFileSync(path.join(root, 'inflight', 'pr-103', '1-1'), 'deploying\n');
  const docker = path.join(root, 'docker'); const log = path.join(root, 'docker.log');
  writeFileSync(docker, `#!/bin/bash\nprintf '%s\\n' "$*" >> '${log}'\nif [[ "$1" == ps ]]; then echo container; fi\n`); chmodSync(docker, 0o755);
  const run = (env = {}) => spawnSync('bash', [path.join(import.meta.dir, 'idle-sleep.sh')], {
    encoding: 'utf8', env: { ...process.env, PREVIEW_ROOT: root, PREVIEW_DOCKER: docker, PREVIEW_NOW_EPOCH: '400000', ...env },
  });
  return { root, log, run };
}
test('48h idle stops even pinned previews, preserves data, and skips recent deploy/activity and inflight deploys', () => {
  const { root, log, run } = fixture(); const result = run();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('IDLE_SLEPT=100');
  const calls = readFileSync(log, 'utf8');
  expect(calls).toMatch(/compose -p yawp-pr-100 .* stop web renderer/);
  for (const pr of [101, 102, 103]) expect(calls).not.toMatch(new RegExp(`compose -p yawp-pr-${pr} .* stop`));
  expect(calls).not.toMatch(/down|rm|prune/);
  expect(existsSync(path.join(root, 'previews/pr-100/docker-compose.yml'))).toBe(true);
});
test('dry-run reports timestamps and exact deadlines without mutation; lane-only override is scoped', () => {
  const { log, run } = fixture();
  const dry = run({ PREVIEW_IDLE_DRY_RUN: 'true' });
  expect(dry.status).toBe(0); expect(dry.stdout).toContain('last_human_activity=1 last_deploy=1 sleeps_at=172801');
  expect(readFileSync(log, 'utf8')).not.toContain(' stop');
  const lane = run({ TARGET_PR: '101', PREVIEW_IDLE_SLEEP_HOURS: '1' });
  expect(lane.status).toBe(0); expect(lane.stdout).toContain('IDLE_SLEPT=101');
  expect(readFileSync(log, 'utf8')).not.toContain('compose -p yawp-pr-100');
});
test('invalid threshold fails closed', () => {
  const { run, log } = fixture(); expect(run({ PREVIEW_IDLE_SLEEP_HOURS: 'oops' }).status).not.toBe(0);
  expect(existsSync(log)).toBe(false);
});
