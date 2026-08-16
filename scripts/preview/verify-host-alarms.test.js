import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'verify-host-alarms.sh');
const roots = [];

function run(alarms) {
  const root = mkdtempSync(path.join(tmpdir(), 'preview-alarms-'));
  roots.push(root);
  const fixture = path.join(root, 'alarms.json');
  const aws = path.join(root, 'aws.sh');
  writeFileSync(fixture, JSON.stringify({ MetricAlarms: alarms }));
  writeFileSync(aws, `#!/usr/bin/env bash\ncat ${JSON.stringify(fixture)}\n`);
  chmodSync(aws, 0o755);
  return Bun.spawnSync({
    cmd: ['bash', script],
    env: { ...process.env, PREVIEW_AWS: aws },
    stdout: 'pipe',
    stderr: 'pipe',
  });
}

function alarm(name, actions = ['arn:aws:sns:us-east-1:123:preview-alerts'], okActions = actions) {
  return {
    AlarmName: name,
    StateValue: 'OK',
    ActionsEnabled: true,
    AlarmActions: actions,
    OKActions: okActions,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('verify-host-alarms.sh', () => {
  test('passes only when all preview alarms retain matching recovery actions', () => {
    const result = run([
      alarm('yawp-preview-host-disk-warning'),
      alarm('yawp-preview-host-memory-warning'),
      alarm('yawp-preview-host-memory-critical'),
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('RECOVERY_ACTIONS=arn:aws:sns');
  });

  test('fails when a recovery action is missing', () => {
    const result = run([
      alarm('yawp-preview-host-disk-warning'),
      alarm('yawp-preview-host-memory-warning', undefined, []),
      alarm('yawp-preview-host-memory-critical'),
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('matching non-empty');
  });

  test('fails when alarm actions are disabled', () => {
    const disabled = alarm('yawp-preview-host-memory-warning');
    disabled.ActionsEnabled = false;
    const result = run([
      alarm('yawp-preview-host-disk-warning'),
      disabled,
      alarm('yawp-preview-host-memory-critical'),
    ]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain('enable actions');
  });
});
