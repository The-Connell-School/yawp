import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

// Runs on the demo host, never in an app container. Its existing instance role
// may assume only this media role; the app receives no host-role credentials.
try {
  const directory = process.env.DEMO_MEDIA_CREDENTIALS_DIR;
  if (!directory || !isAbsolute(directory)) throw new Error();
  const result = spawnSync('aws', [
    'sts', 'assume-role', '--region', 'us-east-1',
    '--role-arn', 'arn:aws:iam::422348803522:role/yawp-demo-training-media',
    '--role-session-name', 'demo-training-media', '--duration-seconds', '3600',
    '--output', 'json',
  ], {
    encoding: 'utf8', timeout: 30000, maxBuffer: 64 * 1024,
    // Use only the demo host instance provider, never a shell/profile credential.
    env: {
      PATH: process.env.PATH,
      AWS_CONFIG_FILE: '/dev/null', AWS_SHARED_CREDENTIALS_FILE: '/dev/null',
      AWS_EC2_METADATA_DISABLED: 'false', AWS_PAGER: '',
    },
  });
  if (result.status !== 0) throw new Error();
  const { Credentials: credentials } = JSON.parse(result.stdout);
  if (!credentials || ['AccessKeyId', 'SecretAccessKey', 'SessionToken'].some(
    (key) => typeof credentials[key] !== 'string' || !credentials[key]
  ) || !(Date.parse(credentials.Expiration) > Date.now() + 10 * 60 * 1000)) throw new Error();
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const atomicWrite = (name, value) => {
    const target = join(directory, name);
    writeFileSync(`${target}.next`, value, { mode: 0o600 });
    chmodSync(`${target}.next`, 0o600);
    renameSync(`${target}.next`, target);
  };
  atomicWrite('config', '[profile demo-training-media]\nregion = us-east-1\ncredential_process = cat /run/demo-training-media/credentials.json\n');
  atomicWrite('credentials.json', JSON.stringify({
    Version: 1,
    AccessKeyId: credentials.AccessKeyId,
    SecretAccessKey: credentials.SecretAccessKey,
    SessionToken: credentials.SessionToken,
    Expiration: credentials.Expiration,
  }));
} catch {
  // SDK/CLI messages and payloads must never reach deployment logs or journal.
  process.stderr.write('Demo training media credential refresh failed\n');
  process.exitCode = 1;
}
