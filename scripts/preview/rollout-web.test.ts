import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/rollout-web.sh');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

async function executable(file: string, contents: string) {
  await writeFile(file, contents);
  await chmod(file, 0o755);
}

async function makeHarness(
  { failAfterStop = false, listFails = false } = {}
) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-demo-rollout-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const dynamic = path.join(root, 'dynamic');
  const state = path.join(root, 'containers');
  const stopped = path.join(root, 'old-stopped');
  const commandLog = path.join(root, 'commands.log');
  const composeFile = path.join(root, 'docker-compose.yml');
  const routerFile = path.join(dynamic, 'yawp-demo-cutover.yml');
  const loginScript = path.join(root, 'smoke-login.mjs');
  await mkdir(bin);
  await mkdir(dynamic);
  await writeFile(
    composeFile,
    'services:\n  web:\n    image: yawp-demo-web:current\n'
  );
  await writeFile(loginScript, '// mocked by PATH\n');
  await writeFile(state, 'old123\n');

  await executable(
    path.join(bin, 'docker'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
if [[ " $* " == *" compose "*" ps --all -q web "* ]]; then
  if [[ "${listFails ? 'true' : 'false'}" == "true" ]]; then exit 55; fi
  cat "$CONTAINER_STATE"
elif [[ " $* " == *" compose "*" up -d --no-recreate --scale web=2 web "* ]]; then
  printf 'old123\nnew456\n' > "$CONTAINER_STATE"
elif [[ " $* " == *" compose "*" up -d web "* ]]; then
  printf 'new456\n' > "$CONTAINER_STATE"
elif [[ "$1" == "inspect" && "$3" == *"State.Health"* ]]; then
  printf 'healthy\n'
elif [[ "$1" == "inspect" && "$3" == *"State.Status"* ]]; then
  if [[ "$4" == "old123" && -f "$OLD_STOPPED" ]]; then
    printf 'exited\n'
  else
    printf 'running\n'
  fi
elif [[ "$1" == "inspect" && "$3" == *"NetworkSettings.Networks"* ]]; then
  printf '172.30.0.42\n'
elif [[ "$1" == "inspect" && "$3" == *".Name"* ]]; then
  printf '/yawp-demo-web-2\n'
elif [[ "$1" == "stop" ]]; then
  touch "$OLD_STOPPED"
elif [[ "$1" == "start" ]]; then
  rm -f "$OLD_STOPPED"
  printf 'old123\nnew456\n' > "$CONTAINER_STATE"
elif [[ "$1" == "rm" && " $* " == *" -f new456 "* ]]; then
  printf 'old123\n' > "$CONTAINER_STATE"
elif [[ "$1" == "rm" && "$2" == "old123" ]]; then
  printf 'new456\n' > "$CONTAINER_STATE"
fi
`
  );
  await executable(
    path.join(bin, 'curl'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'curl' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
if [[ "${failAfterStop ? 'true' : 'false'}" == "true" && -f "$OLD_STOPPED" ]]; then
  exit 22
fi
`
  );
  await executable(
    path.join(bin, 'node'),
    `#!/usr/bin/env bash
set -euo pipefail
printf 'node base=%q script=%q\n' "\${PREVIEW_BASE_URL:-}" "\${1:-}" >> "$COMMAND_LOG"
`
  );
  await executable(path.join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');

  return {
    root,
    state,
    stopped,
    commandLog,
    routerFile,
    composeFile,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      CONTAINER_STATE: state,
      OLD_STOPPED: stopped,
      PREVIEW_COMPOSE_PROJECT: 'yawp-demo',
      PREVIEW_COMPOSE_FILE: composeFile,
      PREVIEW_ROUTER_FILE: routerFile,
      PREVIEW_HOSTNAME: 'demo.preview.yawp.school',
      PREVIEW_PUBLIC_URL: 'https://demo.preview.yawp.school',
      PREVIEW_LOGIN_SMOKE_SCRIPT: loginScript,
      PREVIEW_ACCESS_CODE: 'brave-otter-4193',
      PREVIEW_DATA_MODE: 'seed',
      PREVIEW_RUNTIME: 'production',
      PREVIEW_LOGIN_EMAIL: 'demo@example.test',
      PREVIEW_LOGIN_PASSWORD: 'not-a-real-password',
      PREVIEW_ROLLOUT_ATTEMPTS: '1',
      PREVIEW_ROLLOUT_POLL_SECONDS: '0',
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

describe('demo web rollout', () => {
  test('health-checks a second container before switching traffic and retaining the old container for rollback', async () => {
    const harness = await makeHarness();
    const result = run(harness.env);

    expect({
      exitCode: result.exitCode,
      stderr: new TextDecoder().decode(result.stderr),
    }).toEqual({ exitCode: 0, stderr: '' });
    expect(new TextDecoder().decode(result.stdout)).toContain(
      'PREVIEW_ROLLOUT_MODE=health-gated'
    );
    expect(new TextDecoder().decode(result.stdout)).toContain(
      'PREVIEW_ROLLBACK_WEB_CONTAINER=old123'
    );
    expect(await readFile(harness.state, 'utf8')).toBe('old123\nnew456\n');
    expect(await readFile(`${harness.composeFile}.active-web`, 'utf8')).toBe(
      'new456\n'
    );
    expect(await readFile(harness.routerFile, 'utf8')).toContain(
      'http://yawp-demo-web-2:8080'
    );

    const commands = await readFile(harness.commandLog, 'utf8');
    const scaleIndex = commands.indexOf(
      'up -d --no-recreate --scale web=2 web'
    );
    const directLoginIndex = commands.indexOf('base=http://172.30.0.42:8080');
    const stopIndex = commands.indexOf('docker stop old123');
    expect(scaleIndex).toBeGreaterThan(-1);
    expect(directLoginIndex).toBeGreaterThan(scaleIndex);
    expect(stopIndex).toBeGreaterThan(directLoginIndex);
    expect(commands).not.toContain('docker rm old123');
  });

  test('restores the prior route and old container when post-cutover smoke fails', async () => {
    const harness = await makeHarness({ failAfterStop: true });
    const previousRoute = 'http:\n  services:\n    prior: {}\n';
    await writeFile(harness.routerFile, previousRoute);
    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(harness.routerFile, 'utf8')).toBe(previousRoute);
    expect(await readFile(harness.state, 'utf8')).toBe('old123\n');
    const commands = await readFile(harness.commandLog, 'utf8');
    expect(commands).toContain('docker stop old123');
    expect(commands).toContain('docker start old123');
    expect(commands).toContain('docker rm -f new456');
    expect(commands).not.toContain('docker rm old123');
  });

  test('fails closed without changing routing when Docker cannot list the active container', async () => {
    const harness = await makeHarness({ listFails: true });
    const previousRoute = 'http:\n  services:\n    prior: {}\n';
    await writeFile(harness.routerFile, previousRoute);
    await writeFile(`${harness.composeFile}.active-web`, 'old123\n');

    const result = run(harness.env);

    expect(result.exitCode).not.toBe(0);
    expect(await readFile(harness.routerFile, 'utf8')).toBe(previousRoute);
    expect(await readFile(`${harness.composeFile}.active-web`, 'utf8')).toBe(
      'old123\n'
    );
    expect(await readFile(harness.state, 'utf8')).toBe('old123\n');
    expect(await readFile(harness.commandLog, 'utf8')).not.toContain(
      ' up -d web'
    );
  });
});
