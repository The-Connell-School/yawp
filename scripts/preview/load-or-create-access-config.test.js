import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  countProvisionedPreviewSeatOrgs,
} from '../../packages/prisma/preview-access-code.ts';

const deployScript = path.join(import.meta.dir, 'deploy.sh');
const roots = [];

function syntheticPreviewMasterCode() {
  return `steady-heron-${String(5000 + (Date.now() % 4000)).padStart(4, '0')}`;
}

function makeDockerStub(sourceDir) {
  const binDir = mkdtempSync(path.join(tmpdir(), 'yawp-docker-stub-'));
  const docker = path.join(binDir, 'docker');
  writeFileSync(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
if [[ "\${1:-}" != "run" ]]; then
  echo "unsupported docker invocation: $*" >&2
  exit 1
fi
shift
workdir=""
app_root=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --rm) shift ;;
    -e)
      export "$2"
      shift 2
      ;;
    -v)
      case "$2" in
        *:/app:*) app_root="\${2%%:/app:*}" ;;
      esac
      shift 2
      ;;
    -w)
      workdir="$2"
      shift 2
      ;;
    oven/*)
      shift
      [[ "\${1:-}" == "bun" ]] && shift
      break
      ;;
    *)
      shift
      ;;
  esac
done
if [[ "$workdir" == "/app" && -n "$app_root" ]]; then
  cd "$app_root"
elif [[ -n "$workdir" ]]; then
  cd "$workdir"
fi
exec bun --bun "$@"
`
  );
  chmodSync(docker, 0o755);
  return { binDir, docker };
}

function runLoadOrCreateAccessConfig({
  slug,
  prNumber,
  previewSeatCount,
}) {
  const previewRoot = mkdtempSync(path.join(tmpdir(), 'yawp-access-config-'));
  roots.push(previewRoot);
  const sourceDir = path.join(import.meta.dir, '../..');
  const { binDir } = makeDockerStub(sourceDir);

  const env = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH}`,
    PREVIEW_ROOT: previewRoot,
    PREVIEW_DOMAIN: process.env.PREVIEW_DOMAIN || 'preview.yawp.school',
    PREVIEW_POSTGRES_ADMIN_PASSWORD:
      process.env.PREVIEW_POSTGRES_ADMIN_PASSWORD ||
      'test-preview-postgres-admin-password-32',
    PREVIEW_SEAT_COUNT: String(previewSeatCount),
    PREVIEW_MASTER_ACCESS_CODE: syntheticPreviewMasterCode(),
    YAWP_DEPLOY_STOP_AFTER: 'access_config',
    SOURCE_DIR: sourceDir,
  };

  delete env.PREVIEW_ACCESS_SEATS;

  if (slug === 'demo') {
    env.PREVIEW_SLUG = 'demo';
    delete env.PR_NUMBER;
  } else {
    env.PR_NUMBER = String(prNumber ?? '414');
    delete env.PREVIEW_SLUG;
  }

  const result = spawnSync('bash', [deployScript], {
    env,
    encoding: 'utf8',
    cwd: sourceDir,
  });

  const seatCountLine = result.stdout
    .split('\n')
    .find((line) => line.startsWith('YAWP_TEST_PREVIEW_SEAT_COUNT='));
  const seatsLine = result.stdout
    .split('\n')
    .find((line) => line.startsWith('YAWP_TEST_PREVIEW_ACCESS_SEATS='));

  return {
    exitCode: result.status,
    stderr: result.stderr,
    seatCount: seatCountLine?.slice('YAWP_TEST_PREVIEW_SEAT_COUNT='.length),
    seatsJson: seatsLine?.slice('YAWP_TEST_PREVIEW_ACCESS_SEATS='.length),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('load_or_create_access_config (deploy.sh)', () => {
  test('demo deploy resolves seat count without exporting PREVIEW_ACCESS_SEATS first', () => {
    const result = runLoadOrCreateAccessConfig({
      slug: 'demo',
      previewSeatCount: 1,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'deploy.sh failed');
    }
    expect(result.stderr).toBe('');
    expect(result.seatCount).toBe('1');
    const seats = JSON.parse(result.seatsJson ?? '[]');
    expect(seats).toHaveLength(1);
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(1);
  });

  test('PR preview resolves configured seat count with fixture seats only', () => {
    const result = runLoadOrCreateAccessConfig({
      slug: 'pr-414',
      prNumber: 414,
      previewSeatCount: 27,
    });
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || 'deploy.sh failed');
    }
    expect(result.stderr).toBe('');
    expect(result.seatCount).toBe('27');
    const seats = JSON.parse(result.seatsJson ?? '[]');
    expect(seats).toHaveLength(29);
    expect(countProvisionedPreviewSeatOrgs(seats)).toBe(27);
    expect(
      seats.some((seat) => /^preview-seat-2[89]$/.test(seat.organizationId))
    ).toBe(false);
    expect(seats.some((seat) => seat.organizationId === 'preview-seat-27')).toBe(
      true
    );
  });
});
