import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, chmod, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/prepare-ssh.sh');

async function makeWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-preview-ssh-'));
  const sshDir = path.join(root, '.ssh');
  await mkdir(sshDir, { recursive: true });
  return { root, sshDir };
}

/**
 * Stands in for ssh-keyscan. Emits a host key only once `succeedOnAttempt`
 * calls have been made, so a test can drive the unreachable-host path and the
 * recovers-on-retry path from the same stub.
 */
async function makeKeyscanStub(root, { succeedOnAttempt = 1 } = {}) {
  const countPath = path.join(root, 'attempts');
  const stubPath = path.join(root, 'fake-keyscan.sh');
  await writeFile(
    stubPath,
    `#!/usr/bin/env bash
count=0
if [[ -f ${JSON.stringify(countPath)} ]]; then count="$(cat ${JSON.stringify(countPath)})"; fi
count=$((count + 1))
printf '%s' "$count" > ${JSON.stringify(countPath)}
if [[ "$count" -ge ${succeedOnAttempt} ]]; then
  echo "|1|hashed=|key= ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAA"
  exit 0
fi
exit 1
`
  );
  await chmod(stubPath, 0o755);
  return { stubPath, countPath };
}

function runPrepare(sshDir, stubPath, env = {}) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    env: {
      ...process.env,
      PREVIEW_HOST: '203.0.113.10',
      PREVIEW_SSH_PRIVATE_KEY: 'PRIVATE-KEY-BODY',
      PREVIEW_SSH_DIR: sshDir,
      PREVIEW_SSH_KEYSCAN: stubPath,
      PREVIEW_SSH_KEYSCAN_ATTEMPTS: '3',
      PREVIEW_SSH_KEYSCAN_DELAY: '0',
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function textOf(buffer) {
  return new TextDecoder().decode(buffer);
}

describe('preview prepare-ssh', () => {
  test('writes the deploy key with owner-only permissions', async () => {
    const { root, sshDir } = await makeWorkspace();
    const { stubPath } = await makeKeyscanStub(root);

    const result = runPrepare(sshDir, stubPath);

    expect(result.exitCode).toBe(0);
    const keyPath = path.join(sshDir, 'preview_key');
    expect(await readFile(keyPath, 'utf8')).toBe('PRIVATE-KEY-BODY\n');
    expect((await stat(keyPath)).mode & 0o777).toBe(0o600);
  });

  test('records the scanned host key in known_hosts', async () => {
    const { root, sshDir } = await makeWorkspace();
    const { stubPath } = await makeKeyscanStub(root);

    const result = runPrepare(sshDir, stubPath);

    expect(result.exitCode).toBe(0);
    expect(await readFile(path.join(sshDir, 'known_hosts'), 'utf8')).toContain(
      'ssh-ed25519'
    );
  });

  test('retries a host that is slow to answer', async () => {
    const { root, sshDir } = await makeWorkspace();
    const { stubPath, countPath } = await makeKeyscanStub(root, {
      succeedOnAttempt: 3,
    });

    const result = runPrepare(sshDir, stubPath);

    expect(result.exitCode).toBe(0);
    expect(await readFile(countPath, 'utf8')).toBe('3');
  });

  test('fails with an actionable message when the host never answers', async () => {
    const { root, sshDir } = await makeWorkspace();
    const { stubPath, countPath } = await makeKeyscanStub(root, {
      succeedOnAttempt: 99,
    });

    const result = runPrepare(sshDir, stubPath);

    expect(result.exitCode).toBe(1);
    expect(await readFile(countPath, 'utf8')).toBe('3');
    const stderr = textOf(result.stderr) + textOf(result.stdout);
    // Names the host, the port, and what an operator should go check.
    expect(stderr).toContain('203.0.113.10');
    expect(stderr).toContain('22');
    expect(stderr).toContain('PREVIEW_HOST');
  });

  test('rejects a missing host or key before touching the network', async () => {
    const { root, sshDir } = await makeWorkspace();
    const { stubPath, countPath } = await makeKeyscanStub(root);

    const noHost = runPrepare(sshDir, stubPath, { PREVIEW_HOST: '' });
    expect(noHost.exitCode).toBe(1);
    expect(textOf(noHost.stderr)).toContain('PREVIEW_HOST');

    const noKey = runPrepare(sshDir, stubPath, {
      PREVIEW_SSH_PRIVATE_KEY: '',
    });
    expect(noKey.exitCode).toBe(1);
    expect(textOf(noKey.stderr)).toContain('PREVIEW_SSH_PRIVATE_KEY');

    // Neither attempt should have reached ssh-keyscan.
    expect(await readFile(countPath, 'utf8').catch(() => '0')).toBe('0');
  });
});
