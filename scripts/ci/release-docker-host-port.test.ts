import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('release-docker-host-port removes containers publishing the target port', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'yawp-release-port-'));
  try {
    const bin = path.join(fixture, 'bin');
    fs.mkdirSync(bin, { recursive: true });
    const events = path.join(fixture, 'events');
    fs.writeFileSync(
      path.join(bin, 'docker'),
      `#!/usr/bin/env bash
set -eu
EVENTS="$RELEASE_PORT_EVENTS"
case "$1" in
  ps)
    if [[ "$2" == "-q" ]]; then
      if [[ "$*" == *"publish=54490"* ]]; then
        echo cid-filtered
        exit 0
      fi
      echo cid-a
      echo cid-b
    fi
    exit 0
    ;;
  port)
    cid="$2"
    if [[ "$cid" == cid-a ]]; then
      echo "5432/tcp -> 0.0.0.0:54490"
    fi
    exit 0
    ;;
  rm)
    echo "rm $@" >> "$EVENTS"
    exit 0
    ;;
  *)
    exit 99
    ;;
esac
`,
      { mode: 0o755 }
    );

    const script = path.join(fixture, 'release-docker-host-port.sh');
    fs.copyFileSync(
      new URL('./release-docker-host-port.sh', import.meta.url),
      script
    );
    fs.chmodSync(script, 0o755);

    const result = spawnSync('bash', [script, '54490'], {
      cwd: fixture,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        RELEASE_PORT_EVENTS: events,
      },
    });

    expect(result.status).toBe(0);
    const log = fs.readFileSync(events, 'utf8');
    expect(log).toContain('rm -f cid-filtered');
    expect(log).toContain('rm -f cid-a');
    expect(log).not.toContain('cid-b');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
