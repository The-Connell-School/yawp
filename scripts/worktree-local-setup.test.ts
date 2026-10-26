import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

for (const fresh of [true, false]) {
  test(`worktree bootstrap waits for final Postgres before ${fresh ? 'resetting' : 'checking'} the database`, () => {
    const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'yawp-postgres-startup-'));
    try {
      for (const dir of ['bin', 'scripts', 'packages/prisma', 'services/web-app'])
        fs.mkdirSync(path.join(fixture, dir), { recursive: true });
      const setup = path.join(fixture, 'scripts/setup.sh');
      fs.copyFileSync(new URL('./worktree-local-setup.sh', import.meta.url), setup);
      fs.mkdirSync(path.join(fixture, 'scripts/ci'), { recursive: true });
      fs.copyFileSync(
        new URL('./ci/release-docker-host-port.sh', import.meta.url),
        path.join(fixture, 'scripts/ci/release-docker-host-port.sh')
      );
      const executable = (name: string, body: string) =>
        fs.writeFileSync(path.join(fixture, 'bin', name), `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 });

      // Model the official image's temporary socket-only server. It accepts
      // pg_isready while init scripts / POSTGRES_DB creation are still running.
      executable('docker', `
case "$1" in
  ps) exit 0 ;;
  inspect) exit 1 ;;
  run) echo container; exit 0 ;;
  exec)
    shift 2
    case "$1" in
      pg_isready)
        if [[ " $* " != *" -h 127.0.0.1 "* ]]; then
          echo socket-ready >> "$STARTUP_EVENTS"
          exit 0
        fi
        if [[ ! -f "$FINAL_POSTGRES_READY" ]]; then
          echo tcp-not-ready >> "$STARTUP_EVENTS"
          exit 1
        fi
        echo tcp-ready >> "$STARTUP_EVENTS"
        ;;
      psql)
        if [[ ! -f "$FINAL_POSTGRES_READY" ]]; then
          echo 'database access during entrypoint initialization' >&2
          exit 2
        fi
        echo database-access >> "$STARTUP_EVENTS"
        echo 1
        ;;
      *) exit 90 ;;
    esac
    ;;
  *) exit 91 ;;
esac`);
      // Advance startup only after the readiness loop has rejected the
      // temporary server; no wall-clock delay or probabilistic race required.
      executable('sleep', 'echo startup-complete >> "$STARTUP_EVENTS"\ntouch "$FINAL_POSTGRES_READY"');
      executable('bun', 'echo "bun $*" >> "$STARTUP_EVENTS"');
      executable('curl', 'exit 22');
      const events = path.join(fixture, 'events');
      const result = spawnSync('bash', [setup, ...(fresh ? ['--fresh'] : []), '--no-dev'], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${fixture}/bin:${process.env.PATH}`,
          STARTUP_EVENTS: events,
          FINAL_POSTGRES_READY: path.join(fixture, 'ready'),
        },
      });
      expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
      const calls = fs.readFileSync(events, 'utf8').trim().split('\n');
      expect(calls.slice(0, 5)).toEqual([
        'bun install --frozen-lockfile',
        'tcp-not-ready',
        'startup-complete',
        'tcp-ready',
        'database-access',
      ]);
      expect(calls).not.toContain('socket-ready');
      expect(calls).toContain('bun run --cwd packages/prisma prisma migrate deploy');
    } finally {
      fs.rmSync(fixture, { recursive: true, force: true });
    }
  });
}
