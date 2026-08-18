import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
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
  const inflightMarker = path.join(root, 'inflight', 'pr-42', '1000-1');
  const quarantineMarker = path.join(root, 'quarantine', 'pr-42');
  const enforce = path.join(root, 'enforce.sh');
  const deploy = path.join(root, 'deploy.sh');
  const docker = path.join(root, 'docker');
  const dockerLog = path.join(root, 'docker.log');
  writeFileSync(
    enforce,
    `#!/usr/bin/env bash\necho CAP_RESULT=${capResult}\necho CAP_REASON=running-cap\necho CAP_SLEPT=42\n`
  );
  writeFileSync(
    deploy,
    `#!/usr/bin/env bash\nprintf deployed > ${JSON.stringify(deployMarker)}\necho PREVIEW_URL=https://pr-42.example.test\n`
  );
  writeFileSync(
    docker,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> ${JSON.stringify(dockerLog)}\n`
  );
  chmodSync(enforce, 0o755);
  chmodSync(deploy, 0o755);
  chmodSync(docker, 0o755);
  mkdirSync(path.dirname(inflightMarker), { recursive: true });
  mkdirSync(path.dirname(quarantineMarker), { recursive: true });
  writeFileSync(inflightMarker, '');
  writeFileSync(quarantineMarker, 'requires-clean-redeploy\n');
  return {
    root,
    deployMarker,
    inflightMarker,
    quarantineMarker,
    enforce,
    deploy,
    docker,
    dockerLog,
  };
}

function runFixture(fixture) {
  return Bun.spawnSync({
    cmd: ['bash', script],
    env: {
      ...process.env,
      PREVIEW_ROOT: fixture.root,
      PREVIEW_ENFORCE_CAP_SCRIPT: fixture.enforce,
      PREVIEW_DEPLOY_SCRIPT: fixture.deploy,
      PREVIEW_DOCKER: fixture.docker,
      PREVIEW_FLOCK: 'false',
      PREVIEW_INFLIGHT_MARKER: fixture.inflightMarker,
      PREVIEW_QUARANTINE_MARKER: fixture.quarantineMarker,
      PR_NUMBER: '42',
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
    expect(existsSync(fixture.inflightMarker)).toBe(false);
    expect(existsSync(fixture.quarantineMarker)).toBe(false);
  });

  test('does not deploy when capacity is full', () => {
    const fixture = makeFixture('full');

    const result = runFixture(fixture);

    expect(result.exitCode).toBe(75);
    expect(existsSync(fixture.deployMarker)).toBe(false);
    expect(existsSync(fixture.inflightMarker)).toBe(false);
    expect(existsSync(fixture.quarantineMarker)).toBe(true);
  });

  test('stops an unhealthy container after deploy failure while preserving quarantine', () => {
    const fixture = makeFixture('ok');
    const composeDir = path.join(fixture.root, 'previews', 'pr-42');
    mkdirSync(composeDir, { recursive: true });
    writeFileSync(path.join(composeDir, 'docker-compose.yml'), 'services: {}\n');
    writeFileSync(
      fixture.deploy,
      '#!/usr/bin/env bash\necho deploy failed >&2\nexit 1\n'
    );

    const result = runFixture(fixture);

    expect(result.exitCode).toBe(1);
    expect(readFileSync(fixture.dockerLog, 'utf8')).toContain(
      `compose -p yawp-pr-42 -f ${path.join(composeDir, 'docker-compose.yml')} stop`
    );
    expect(existsSync(fixture.inflightMarker)).toBe(false);
    expect(existsSync(fixture.quarantineMarker)).toBe(true);
    expect(existsSync(composeDir)).toBe(true);
  });
});
