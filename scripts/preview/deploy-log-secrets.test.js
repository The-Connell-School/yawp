import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, writeFileSync } from 'node:fs';

const deploySh = readFileSync(
  new URL('./deploy.sh', import.meta.url),
  'utf8'
);
const detachedSh = readFileSync(
  new URL('./run-host-deploy-detached.sh', import.meta.url),
  'utf8'
);

describe('preview deploy logs must not emit access secrets', () => {
  test('deploy.sh success output references seat file paths, not code values', () => {
    expect(deploySh).toContain('PREVIEW_ACCESS_SEATS_FILE=$ACCESS_SEATS_FILE');
    expect(deploySh).not.toMatch(/echo\s+"PREVIEW_ACCESS_CODE=\$/);
    expect(deploySh).not.toContain('PREVIEW_SEAT_CODE_');
    expect(deploySh).not.toMatch(/Preview seat \$\{index \+ 1\}.*seat\.code/);
    expect(deploySh).toContain('PREVIEW_SEAT_LABEL_');
  });

  test('run-host-deploy-detached masks access codes on every log copy path', () => {
    expect(detachedSh).toContain('mask_deploy_log');
    expect(detachedSh).toContain('copy_deploy_log_local');
    expect(detachedSh).toMatch(/Deploy timed out[\s\S]*copy_deploy_log_local/);
    expect(detachedSh).toContain('PREVIEW_SEAT_CODE_');
    expect(detachedSh).toContain('YAWP_TEST_PREVIEW_ACCESS_SEATS');
    expect(detachedSh).toContain('PREVIEW_MASTER_ACCESS_CODE=');
    expect(detachedSh).toContain('redact-deploy-logs.last');
    expect(detachedSh).toContain('timeout -k 30 600');
    expect(detachedSh).toMatch(/flock -w 1800 "\$1" bash -lc "\$2"/);
  });

  test('mask_deploy_log redacts sample deploy log lines', () => {
    const sample = [
      'PREVIEW_ACCESS_CODE=brave-otter-4193',
      'PREVIEW_SEAT_CODE_1=brave-otter-4193',
      'Preview seat 1 (Brian Connell): brave-otter-4193',
      'YAWP_TEST_PREVIEW_ACCESS_SEATS=[{"code":"secret-otter-4193"}]',
      'PREVIEW_MASTER_ACCESS_CODE=steady-heron-5001',
    ].join('\n');

    const fnStart = detachedSh.indexOf('mask_deploy_log() {');
    const fnEnd = detachedSh.indexOf('\n}\n', fnStart) + 2;
    const maskFn = detachedSh.slice(fnStart, fnEnd);

    const result = spawnSync(
      'bash',
      ['-c', `${maskFn}\nprintf '%s\\n' "$sample" | mask_deploy_log`],
      { encoding: 'utf8', env: { ...process.env, sample } }
    );

    expect(result.status).toBe(0);
    const out = result.stdout;
    expect(out).not.toContain('brave-otter-4193');
    expect(out).not.toContain('secret-otter-4193');
    expect(out).not.toContain('steady-heron-5001');
    expect(out).toContain('PREVIEW_ACCESS_CODE=[REDACTED]');
    expect(out).toContain('PREVIEW_SEAT_CODE_1=[REDACTED]');
  });

  test('read-smoke-access-code-from-seats-file reads first seat only', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'preview-seats-'));
    const seatsFile = path.join(dir, 'access-seats.json');
    writeFileSync(
      seatsFile,
      JSON.stringify([
        { code: 'alpha-otter-1111', organizationId: 'org-a', label: 'A' },
        { code: 'beta-panda-2222', organizationId: 'org-b', label: 'B' },
      ])
    );

    const script = new URL(
      './read-smoke-access-code-from-seats-file.mjs',
      import.meta.url
    ).pathname;
    const result = spawnSync('node', [script, seatsFile], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe('alpha-otter-1111');
  });
});
