import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = path.join(import.meta.dir, 'publish-host-metrics.sh');
const roots = [];

function makeFixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'yawp-host-metrics-'));
  roots.push(root);
  for (const pr of [11, 12, 13]) {
    mkdirSync(path.join(root, 'previews', `pr-${pr}`), { recursive: true });
  }

  const meminfo = path.join(root, 'meminfo');
  writeFileSync(
    meminfo,
    [
      'MemTotal:        8000000 kB',
      'MemAvailable:    2000000 kB',
      'SwapTotal:       4000000 kB',
      'SwapFree:        3000000 kB',
      '',
    ].join('\n')
  );

  const df = path.join(root, 'df.sh');
  writeFileSync(
    df,
    '#!/usr/bin/env bash\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/test 100 50 50 50% /srv"\n'
  );
  chmodSync(df, 0o755);

  const docker = path.join(root, 'docker.sh');
  writeFileSync(
    docker,
    '#!/usr/bin/env bash\n[[ "$*" == *"yawp-pr-11"* || "$*" == *"yawp-pr-13"* ]] && echo container-id\nexit 0\n'
  );
  chmodSync(docker, 0o755);

  const awsLog = path.join(root, 'aws.log');
  const aws = path.join(root, 'aws.sh');
  writeFileSync(
    aws,
    `#!/usr/bin/env bash\nprintf '%s\\n' "$*" > ${JSON.stringify(awsLog)}\n`
  );
  chmodSync(aws, 0o755);
  return { root, meminfo, df, docker, aws, awsLog };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('publish-host-metrics.sh', () => {
  test('publishes aggregate host and preview counts without PR dimensions', () => {
    const fixture = makeFixture();

    const result = Bun.spawnSync({
      cmd: ['bash', script],
      env: {
        ...process.env,
        PREVIEW_ROOT: fixture.root,
        PREVIEW_MEMINFO_FILE: fixture.meminfo,
        PREVIEW_DF: fixture.df,
        PREVIEW_DOCKER: fixture.docker,
        PREVIEW_AWS: fixture.aws,
        PREVIEW_INSTANCE_ID: 'i-test123',
        PREVIEW_AWS_REGION: 'us-east-1',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    const call = readFileSync(fixture.awsLog, 'utf8');
    expect(call).toContain('cloudwatch put-metric-data');
    expect(call).toContain('Yawp/PreviewHost');
    expect(call).toContain('MemoryUsedPercent');
    expect(call).toContain('"Value":75.00');
    expect(call).toContain('SwapUsedPercent');
    expect(call).toContain('"Value":25.00');
    expect(call).toContain('DiskUsedPercent');
    expect(call).toContain('"Value":50');
    expect(call).toContain('ResidentPreviews');
    expect(call).toContain('"Value":3');
    expect(call).toContain('RunningPreviews');
    expect(call).toContain('"Value":2');
    expect(call).toContain('SleepingPreviews');
    expect(call).toContain('"Value":1');
    expect(call).toContain('InstanceId');
    expect(call).toContain('i-test123');
    expect(call).not.toContain('pr-11');
  });
});
