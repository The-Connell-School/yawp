import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/find-traefik-dynamic-dir.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function makeHarness({ duplicate = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-traefik-dir-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const dynamic = path.join(root, 'preview-host', 'traefik', 'dynamic');
  const otherDynamic = path.join(root, 'other', 'dynamic');
  await mkdir(bin);
  await mkdir(dynamic, { recursive: true });
  await mkdir(otherDynamic, { recursive: true });
  await writeFile(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
if [[ " $* " == *" ps --format "* ]]; then
  printf 'app123 yawp-demo-web:current\n'
  printf 'traefik123 traefik:v3.1\n'
  ${duplicate ? "printf 'traefik456 docker.io/library/traefik:v3.1\\n'" : ':'}
elif [[ " $* " == *" inspect "*"traefik123"* ]]; then
  printf '${dynamic}\n'
elif [[ " $* " == *" inspect "*"traefik456"* ]]; then
  printf '${otherDynamic}\n'
else
  echo "Unexpected docker command: $*" >&2
  exit 1
fi
`
  );
  await chmod(path.join(bin, 'docker'), 0o755);
  return {
    dynamic,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
    },
  };
}

function run(env: Record<string, string | undefined>) {
  return Bun.spawnSync({
    cmd: ['bash', scriptPath],
    cwd: path.resolve('.'),
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

describe('Traefik dynamic directory discovery', () => {
  test('uses the host directory mounted at /dynamic by the running Traefik container', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout).trim()).toBe(
      harness.dynamic
    );
  });

  test('fails closed when multiple Traefik containers expose different dynamic directories', async () => {
    const harness = await makeHarness({ duplicate: true });
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      'Expected exactly one Traefik dynamic directory'
    );
  });
});
