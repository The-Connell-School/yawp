import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve(
  'scripts/preview/enable-traefik-file-provider.sh'
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

const legacyCompose = `services:
  traefik:
    image: traefik:v3.1
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt
`;

async function makeHarness({
  failPostUpgradeHealth = false,
  compose = legacyCompose,
  createDynamic = false,
}: {
  failPostUpgradeHealth?: boolean;
  compose?: string;
  createDynamic?: boolean;
} = {}) {
  const sandbox = await mkdtemp(
    path.join(tmpdir(), 'yawp-traefik-provider-test-')
  );
  temporaryDirectories.push(sandbox);
  const traefikDir = path.join(sandbox, 'traefik');
  const bin = path.join(sandbox, 'bin');
  const commandLog = path.join(sandbox, 'commands.log');
  const healthCount = path.join(sandbox, 'health-count');
  await mkdir(traefikDir, { recursive: true });
  await mkdir(bin);
  await writeFile(path.join(traefikDir, 'docker-compose.yml'), compose);
  if (createDynamic) await mkdir(path.join(traefikDir, 'dynamic'));
  await writeFile(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_COMMAND_LOG"
if [[ "$1" == "compose" && " $* " == *" config "* ]]; then
  exit 0
fi
if [[ "$1" == "compose" && " $* " == *" up -d traefik "* ]]; then
  exit 0
fi
if [[ "$1" == "compose" && " $* " == *" ps -q traefik "* ]]; then
  printf 'traefik123\n'
  exit 0
fi
if [[ "$1" == "inspect" && " $* " == *"Config.Cmd"* ]]; then
  printf '["--providers.file.directory=/dynamic","--providers.file.watch=true"]\n'
  exit 0
fi
if [[ "$1" == "inspect" && " $* " == *".Destination"* ]]; then
  printf 'bind\n'
  exit 0
fi
echo "Unexpected docker command: $*" >&2
exit 1
`
  );
  await writeFile(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
count=0
[[ ! -f "$MOCK_HEALTH_COUNT" ]] || count="$(<"$MOCK_HEALTH_COUNT")"
count=$((count + 1))
printf '%s\n' "$count" > "$MOCK_HEALTH_COUNT"
if [[ "${failPostUpgradeHealth ? 'true' : 'false'}" == "true" && "$count" == "2" ]]; then
  exit 1
fi
printf 'OK\n'
`
  );
  await chmod(path.join(bin, 'docker'), 0o755);
  await chmod(path.join(bin, 'curl'), 0o755);

  return {
    sandbox,
    composeFile: path.join(traefikDir, 'docker-compose.yml'),
    commandLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      PREVIEW_ROOT: sandbox,
      PREVIEW_ROOT_PARENT: path.dirname(sandbox),
      PREVIEW_PUBLIC_URL: 'https://demo.yawp.school',
      TRAEFIK_HEALTH_ATTEMPTS: '1',
      MOCK_COMMAND_LOG: commandLog,
      MOCK_HEALTH_COUNT: healthCount,
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

describe('demo Traefik file-provider upgrade', () => {
  test('adds the dynamic provider and bind mount while retaining a backup', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    const compose = await readFile(harness.composeFile, 'utf8');
    expect(compose).toContain('--providers.file.directory=/dynamic');
    expect(compose).toContain('--providers.file.watch=true');
    expect(compose).toContain('./dynamic:/dynamic:ro');
    const files = await readdir(path.dirname(harness.composeFile));
    expect(files.some((file) => file.includes('.pre-file-provider.'))).toBe(
      true
    );
    expect(await readFile(harness.commandLog, 'utf8')).toContain(
      'up -d traefik'
    );
  });

  test('restores the old compose file when post-upgrade health fails', async () => {
    const harness = await makeHarness({ failPostUpgradeHealth: true });
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(harness.composeFile, 'utf8')).toBe(legacyCompose);
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands.match(/up -d traefik/g)?.length).toBe(2);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      'Previous Traefik configuration restored and demo is healthy'
    );
  });

  test('is a verified no-op after the provider is fully enabled', async () => {
    const configuredCompose = legacyCompose
      .replace(
        '      - --providers.docker.exposedbydefault=false',
        '      - --providers.docker.exposedbydefault=false\n      - --providers.file.directory=/dynamic\n      - --providers.file.watch=true'
      )
      .replace(
        '      - /var/run/docker.sock:/var/run/docker.sock:ro',
        '      - /var/run/docker.sock:/var/run/docker.sock:ro\n      - ./dynamic:/dynamic:ro'
      );
    const harness = await makeHarness({
      compose: configuredCompose,
      createDynamic: true,
    });
    const result = run(harness.env);

    expect(result.exitCode).toBe(0);
    expect(new TextDecoder().decode(result.stdout)).toContain(
      'TRAEFIK_FILE_PROVIDER_ENABLED=already'
    );
    expect(await readFile(harness.commandLog, 'utf8')).not.toContain(
      'up -d traefik'
    );
  });

  test('refuses a partially applied provider configuration without mutation', async () => {
    const partialCompose = legacyCompose.replace(
      '      - --providers.docker.exposedbydefault=false',
      '      - --providers.docker.exposedbydefault=false\n      - --providers.file.directory=/dynamic'
    );
    const harness = await makeHarness({ compose: partialCompose });
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(harness.composeFile, 'utf8')).toBe(partialCompose);
    expect(new TextDecoder().decode(result.stderr)).toContain(
      'only partially applied'
    );
  });
});
