import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.join(import.meta.dir, 'redact-deploy-logs.sh');
const detachedScript = path.join(import.meta.dir, 'run-host-deploy-detached.sh');
const roots = [];

const FIXTURE = {
  accessCode: 'zeta-yak-9001',
  seatCode1: 'brave-otter-9002',
  seatCode2: 'calm-panda-9003',
  seatCode3: 'bold-fox-9004',
  masterCode: 'steady-heron-5005',
  accessSecret: 'fixture-access-secret-thirty-two-bytes-00',
};

function sensitivePatterns() {
  return [
    FIXTURE.accessCode,
    FIXTURE.seatCode1,
    FIXTURE.seatCode2,
    FIXTURE.seatCode3,
    FIXTURE.masterCode,
    FIXTURE.accessSecret,
  ];
}

function markFinished(logPath, status = '0') {
  writeFileSync(`${logPath}.exit`, `${status}\n`, { mode: 0o644 });
}

function summaryPath(dir) {
  return path.join(dir, 'redact-deploy-logs.last');
}

function makeFixtureLogDir() {
  const dir = mkdtempSync(path.join(tmpdir(), 'yawp-redact-deploy-logs-'));
  roots.push(dir);

  const oldMtime = new Date('2020-06-15T12:00:00Z');
  const logPath = path.join(dir, 'pr-1-deploy-2020.log');
  const seatsJsonPath = path.join(dir, 'access-seats.json');
  const otherLogPath = path.join(dir, 'application.log');

  writeFileSync(
    logPath,
    [
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}`,
      `PREVIEW_SEAT_CODE_1=${FIXTURE.seatCode1}`,
      `Preview seat 1 (Brian Connell): ${FIXTURE.seatCode1}`,
      `Preview seat 2 (Master): created preview-seat-2`,
      `PREVIEW_ACCESS_SEATS=${JSON.stringify([
        { code: FIXTURE.seatCode1, label: 'Seat 1' },
        { code: FIXTURE.seatCode2, label: 'Seat 2' },
        { code: FIXTURE.seatCode3, label: 'Seat 3' },
      ])}`,
      `YAWP_TEST_PREVIEW_ACCESS_SEATS=${JSON.stringify([
        { code: FIXTURE.seatCode2, label: 'Seat 2' },
      ])}`,
      `PREVIEW_MASTER_ACCESS_CODE=${FIXTURE.masterCode}`,
      `PREVIEW_ACCESS_SECRET=${FIXTURE.accessSecret}`,
      '{"code":"P2002","meta":{"modelName":"User"}}',
      'unchanged line without secrets',
      '',
    ].join('\n'),
    { mode: 0o640 }
  );
  utimesSync(logPath, oldMtime, oldMtime);
  markFinished(logPath);

  writeFileSync(seatsJsonPath, JSON.stringify({ code: FIXTURE.accessCode }), {
    mode: 0o600,
  });
  writeFileSync(otherLogPath, `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`, {
    mode: 0o644,
  });

  return { dir, logPath, seatsJsonPath, otherLogPath, oldMtime };
}

function runRedact(dir, extraArgs = []) {
  return spawnSync('bash', [script, dir, ...extraArgs], {
    encoding: 'utf8',
  });
}

function countSensitiveLines(filePath) {
  const text = readFileSync(filePath, 'utf8');
  for (const needle of sensitivePatterns()) {
    expect(text.includes(needle)).toBe(false);
  }
  expect(text).toContain('Preview seat 2 (Master): created preview-seat-2');
  expect(text).toContain('"code":"P2002"');
}

function countFileLines(filePath) {
  return Number(spawnSync('wc', ['-l', filePath], { encoding: 'utf8' }).stdout.trim().split(/\s+/)[0]);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe('redact-deploy-logs.sh', () => {
  test('redacts deploy logs in every legacy format while preserving metadata', () => {
    const { dir, logPath, seatsJsonPath, otherLogPath, oldMtime } =
      makeFixtureLogDir();
    const beforeLines = countFileLines(logPath);
    const beforeStat = statSync(logPath);

    const first = runRedact(dir);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('files_scanned=1');
    expect(first.stdout).toContain('files_changed=1');
    expect(first.stdout).toMatch(/values_masked=9/);

    const summary = readFileSync(summaryPath(dir), 'utf8');
    expect(summary).toContain('REDACT_FILES_SCANNED=1');
    expect(summary).toContain('REDACT_TIMESTAMP=');
    for (const needle of sensitivePatterns()) {
      expect(summary.includes(needle)).toBe(false);
      expect(first.stdout.includes(needle)).toBe(false);
    }

    const afterText = readFileSync(logPath, 'utf8');
    expect(countFileLines(logPath)).toBe(beforeLines);
    countSensitiveLines(logPath);
    expect(afterText).toContain('Preview seat 1 (Brian Connell): [REDACTED]');
    expect(afterText.match(/"code":"\[REDACTED\]"/g)?.length).toBe(4);

    expect(statSync(logPath).mode).toBe(beforeStat.mode);
    expect(statSync(logPath).mtimeMs).toBe(oldMtime.getTime());
    expect(readFileSync(seatsJsonPath, 'utf8')).toContain(FIXTURE.accessCode);
    expect(readFileSync(otherLogPath, 'utf8')).toContain(FIXTURE.accessCode);

    const second = runRedact(dir);
    expect(second.stdout).toContain('files_changed=0');
    expect(second.stdout).toContain('values_masked=0');
  });

  test('masks master-shaped, suffixed, and CRLF access codes without partial leaks', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yawp-redact-backref-'));
    roots.push(dir);
    const master = 'fakemaster-x9-zz';
    const suffixed = `${FIXTURE.accessCode}-extra`;
    const logPath = path.join(dir, 'demo-deploy-backref.log');
    writeFileSync(
      logPath,
      `PREVIEW_ACCESS_CODE=${master}\r\n` +
        `PREVIEW_MASTER_ACCESS_CODE=${master}\r\n` +
        `PREVIEW_ACCESS_CODE=${suffixed}\n`,
      { mode: 0o644 }
    );
    markFinished(logPath);
    utimesSync(logPath, new Date('2018-01-01'), new Date('2018-01-01'));

    const result = runRedact(dir);
    expect(result.status).toBe(0);
    const redacted = readFileSync(logPath, 'utf8');
    expect(redacted).toBe(
      'PREVIEW_ACCESS_CODE=[REDACTED]\r\nPREVIEW_MASTER_ACCESS_CODE=[REDACTED]\r\nPREVIEW_ACCESS_CODE=[REDACTED]\n'
    );
    expect(redacted.includes('x9')).toBe(false);
    expect(redacted.includes('-zz')).toBe(false);
    expect(redacted.includes('-extra')).toBe(false);
    expect(redacted.includes(FIXTURE.accessCode)).toBe(false);
  });

  test('handles CRLF lines and writes summary without secret values', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yawp-redact-crlf-'));
    roots.push(dir);
    const logPath = path.join(dir, 'demo-deploy-2019.log');
    writeFileSync(
      logPath,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\r\n`,
      { mode: 0o644 }
    );
    markFinished(logPath);

    const result = runRedact(dir);
    expect(result.status).toBe(0);
    const redacted = readFileSync(logPath, 'utf8');
    expect(redacted).toContain('PREVIEW_ACCESS_CODE=[REDACTED]');
    expect(redacted.includes(FIXTURE.accessCode)).toBe(false);
    expect(redacted.endsWith('\n') || redacted.endsWith('\r\n')).toBe(true);
    expect(readFileSync(summaryPath(dir), 'utf8')).not.toContain(
      FIXTURE.accessCode
    );
  });

  test('skips in-flight logs without exit markers and symlink targets', () => {
    const { dir, logPath } = makeFixtureLogDir();
    const inFlight = path.join(dir, 'pr-9-deploy-open.log');
    writeFileSync(
      inFlight,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );

    const outside = mkdtempSync(path.join(tmpdir(), 'yawp-redact-outside-'));
    roots.push(outside);
    const outsideLog = path.join(outside, 'other-deploy.log');
    writeFileSync(
      outsideLog,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );
    markFinished(outsideLog);
    symlinkSync(outsideLog, path.join(dir, 'linked-deploy.log'));

    runRedact(dir);
    expect(readFileSync(inFlight, 'utf8')).toContain(FIXTURE.accessCode);
    expect(readFileSync(outsideLog, 'utf8')).toContain(FIXTURE.accessCode);
    countSensitiveLines(logPath);
  });

  test('redacts a 5,000-line deploy log in under two seconds', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yawp-redact-perf-'));
    roots.push(dir);
    const logPath = path.join(dir, 'demo-deploy-perf.log');
    const lines = Array.from({ length: 4999 }, (_, i) => `noise line ${i}`);
    lines.push(`PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}`);
    writeFileSync(logPath, `${lines.join('\n')}\n`, { mode: 0o644 });
    markFinished(logPath);
    utimesSync(logPath, new Date('2019-01-01'), new Date('2019-01-01'));

    const start = performance.now();
    const result = runRedact(dir);
    const elapsed = performance.now() - start;
    expect(result.status).toBe(0);
    expect(elapsed).toBeLessThan(2000);
    expect(readFileSync(logPath, 'utf8')).toContain('PREVIEW_ACCESS_CODE=[REDACTED]');
  });

  test('removes stale temp files and cleans up on verification failure', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yawp-redact-temp-'));
    roots.push(dir);
    const stale = path.join(dir, '.redact-deploy-logs.stale');
    writeFileSync(stale, FIXTURE.accessCode, { mode: 0o600 });
    utimesSync(stale, new Date('2010-01-01'), new Date('2010-01-01'));

    const logPath = path.join(dir, 'demo-deploy-temp.log');
    writeFileSync(
      logPath,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\nREDACT_TEST_INJECT=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );
    markFinished(logPath);

    runRedact(dir);
    expect(existsSync(stale)).toBe(false);
    expect(
      spawnSync('bash', ['-c', `ls -1 "${dir}"/.redact-deploy-logs.* 2>/dev/null | wc -l`], {
        encoding: 'utf8',
      }).stdout.trim()
    ).toBe('0');
  });
});

describe('run-host-deploy-detached.sh redaction integration', () => {
  test('preserves deploy execution and exit codes when background redaction fails', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'yawp-detached-redact-'));
    roots.push(root);
    const source = path.join(root, 'remote-source');
    const bin = path.join(root, 'bin');
    mkdirSync(source);
    mkdirSync(bin);
    writeFileSync(
      path.join(bin, 'ssh'),
      `#!/usr/bin/env bash
set -euo pipefail
while [[ "$1" == -* ]]; do
  case "$1" in
    -i|-o) shift 2 ;;
    *) shift ;;
  esac
done
shift
if [[ "$1" == "bash" && "$2" == "-s" ]]; then
  exec bash -s
fi
exec bash -c "$*"
`,
      { mode: 0o755 }
    );
    writeFileSync(
      path.join(bin, 'scp'),
      `#!/usr/bin/env bash
set -euo pipefail
while [[ "$1" == -* ]]; do
  case "$1" in
    -i) shift 2 ;;
    -q) shift ;;
    *) shift ;;
  esac
done
cp -- "\${1#*:}" "$2"
`,
      { mode: 0o755 }
    );
    writeFileSync(
      path.join(source, 'target.sh'),
      `#!/usr/bin/env bash
set -euo pipefail
printf 'executed\\n'
`,
      { mode: 0o755 }
    );

    const logDir = path.join(root, 'logs');
    mkdirSync(logDir);
    writeFileSync(
      path.join(logDir, 'redact-deploy-logs.last'),
      [
        'REDACT_TIMESTAMP=2020-01-01T00:00:00Z',
        'REDACT_FILES_SCANNED=4',
        'REDACT_FILES_CHANGED=2',
        'REDACT_VALUES_MASKED=7',
      ].join('\n'),
      { mode: 0o644 }
    );

    const deployLog = path.join(logDir, 'demo-deploy.log');
    const result = spawnSync('bash', [detachedScript], {
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        SSH_IDENTITY: path.join(root, 'id'),
        SSH_TARGET: 'fixture-host',
        LOCK_FILE: path.join(root, 'lock'),
        DEPLOY_LOG: deployLog,
        LOCAL_LOG_COPY: path.join(root, 'local.log'),
        DEPLOY_TIMEOUT_SECONDS: '2',
        DEPLOY_POLL_SECONDS: '0.05',
        REMOTE_COMMAND: `cd ${source} && bash target.sh`,
        REDACT_DEPLOY_LOGS_SCRIPT: path.join(root, 'missing-redact.sh'),
      },
    });

    expect(result.status).toBe(0);
    const localLog = readFileSync(path.join(root, 'local.log'), 'utf8');
    expect(localLog).toContain('REDACT_FILES_SCANNED=4');
    expect(localLog).toContain('executed');
    expect(localLog.includes(FIXTURE.accessCode)).toBe(false);
  });
});
