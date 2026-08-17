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
import { spawnSync } from 'node:child_process';

const script = path.join(import.meta.dir, 'sync-source.sh');
const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function executable(file, source) {
  writeFileSync(file, source);
  chmodSync(file, 0o755);
}

describe('sync-source.sh', () => {
  test('fails closed and terminates rsync when marker heartbeat refresh fails', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'preview-sync-'));
    roots.push(root);
    const bin = path.join(root, 'bin');
    const marker = path.join(root, 'marker');
    const killed = path.join(root, 'rsync-killed');
    mkdirSync(bin);
    writeFileSync(marker, 'in-flight\n');
    executable(path.join(bin, 'ssh'), '#!/usr/bin/env bash\nexit 1\n');
    executable(
      path.join(bin, 'rsync'),
      `#!/usr/bin/env bash\ntrap 'touch ${JSON.stringify(killed)}; exit 143' TERM INT\nwhile :; do sleep 0.1; done\n`,
    );

    const result = spawnSync('bash', [script], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        PREVIEW_SSH_KEY: path.join(root, 'key'),
        PREVIEW_SSH_TARGET: 'preview@example.test',
        PREVIEW_REMOTE_SOURCE: '/srv/yawp-preview/sources/pr-241',
        PREVIEW_INFLIGHT_MARKER: marker,
        PREVIEW_INFLIGHT_TTL_SECONDS: '3',
        PREVIEW_HEARTBEAT_MIN_SECONDS: '1',
        PREVIEW_HEARTBEAT_MAX_SECONDS: '1',
      },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('heartbeat failed');
    expect(existsSync(killed)).toBe(true);
    expect(readFileSync(marker, 'utf8')).toBe('in-flight\n');
  });
});
