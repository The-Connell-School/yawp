import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'admit-and-deploy.sh');
const roots = [];

function makeFixture(capResult = 'ok') {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-admit-deploy-'));
  roots.push(root);
  const deployMarker = path.join(root, 'deployed');
  const enforce = path.join(root, 'enforce.sh');
  const deploy = path.join(root, 'deploy.sh');
  writeFileSync(
    enforce,
    `#!/usr/bin/env bash\necho CAP_RESULT=${capResult}\necho CAP_REASON=running-cap\necho CAP_SLEPT=42\n`
  );
  writeFileSync(
    deploy,
    `#!/usr/bin/env bash\nprintf deployed > ${JSON.stringify(deployMarker)}\necho PREVIEW_URL=https://pr-42.example.test\n`
  );
  chmodSync(enforce, 0o755);
  chmodSync(deploy, 0o755);
  return { root, deployMarker, enforce, deploy };
}

function runFixture(fixture) {
  return Bun.spawnSync({
    cmd: ['bash', script],
    env: {
      ...process.env,
      PREVIEW_ROOT: fixture.root,
      PREVIEW_ENFORCE_CAP_SCRIPT: fixture.enforce,
      PREVIEW_DEPLOY_SCRIPT: fixture.deploy,
      PREVIEW_FLOCK: 'false',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('admit-and-deploy.sh', () => {
  test('deploys while forwarding capacity and deploy output', () => {
    const fixture = makeFixture('ok');

    const result = runFixture(fixture);
    const stdout = new TextDecoder().decode(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(stdout).toContain('CAP_SLEPT=42');
    expect(stdout).toContain('PREVIEW_URL=https://pr-42.example.test');
    expect(readFileSync(fixture.deployMarker, 'utf8')).toBe('deployed');
  });

  test('does not deploy when capacity is full', () => {
    const fixture = makeFixture('full');

    const result = runFixture(fixture);

    expect(result.exitCode).toBe(75);
    expect(existsSync(fixture.deployMarker)).toBe(false);
  });
});
