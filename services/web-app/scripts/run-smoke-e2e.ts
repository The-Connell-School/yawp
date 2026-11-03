import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  E2E_SMOKE_SHARDS,
  E2E_SMOKE_SPECS,
  parseSmokeShardArg,
} from '../e2e/smoke-specs.ts';

const webAppRoot = fileURLToPath(new URL('..', import.meta.url));
const passthrough: string[] = [];
let shard: ReturnType<typeof parseSmokeShardArg>;

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--shard=')) {
    shard = parseSmokeShardArg(arg.slice('--shard='.length));
    continue;
  }
  passthrough.push(arg);
}

const specs = shard ? [...E2E_SMOKE_SHARDS[shard]] : [...E2E_SMOKE_SPECS];

const result = spawnSync(
  'bunx',
  ['playwright', 'test', '--project=chromium', ...specs, ...passthrough],
  {
    cwd: webAppRoot,
    stdio: 'inherit',
    env: process.env,
  },
);

process.exit(result.status ?? 1);
