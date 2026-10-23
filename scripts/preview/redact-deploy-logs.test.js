import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
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
  masterCode: 'steady-heron-5004',
  accessSecret: 'fixture-access-secret-thirty-two-bytes-00',
};

function sensitivePatterns() {
  return [
    FIXTURE.accessCode,
    FIXTURE.seatCode1,
    FIXTURE.seatCode2,
    FIXTURE.masterCode,
    FIXTURE.accessSecret,
  ];
}

function markFinished(logPath, status = '0') {
  writeFileSync(`${logPath}.exit`, `${status}\n`, { mode: 0o644 });
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
      `PREVIEW_SEAT_CODE_2=${FIXTURE.seatCode2}`,
      `Preview seat 3 (Bryant Brock): ${FIXTURE.seatCode2}`,
      `PREVIEW_ACCESS_SEATS=${JSON.stringify([
        { code: FIXTURE.seatCode1, label: 'Seat 1' },
        { code: FIXTURE.seatCode2, label: 'Seat 2' },
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
    expect(first.stdout).toMatch(/values_masked=11/);

    for (const needle of sensitivePatterns()) {
      expect(first.stdout.includes(needle)).toBe(false);
      expect(first.stderr.includes(needle)).toBe(false);
    }

    const afterText = readFileSync(logPath, 'utf8');
    expect(countFileLines(logPath)).toBe(beforeLines);
    countSensitiveLines(logPath);
    expect(afterText).toContain('unchanged line without secrets');
    expect(afterText).toContain('PREVIEW_ACCESS_CODE=[REDACTED]');
    expect(afterText).toContain('Preview seat 1 (Brian Connell): [REDACTED]');

    const afterStat = statSync(logPath);
    expect(afterStat.mode).toBe(beforeStat.mode);
    expect(afterStat.mtimeMs).toBe(oldMtime.getTime());

    expect(readFileSync(seatsJsonPath, 'utf8')).toContain(FIXTURE.accessCode);
    expect(readFileSync(otherLogPath, 'utf8')).toContain(FIXTURE.accessCode);

    const second = runRedact(dir);
    expect(second.status).toBe(0);
    expect(second.stdout).toContain('files_changed=0');
    expect(second.stdout).toContain('values_masked=0');
  });

  test('handles CRLF lines and deploy output metrics format', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'yawp-redact-crlf-'));
    roots.push(dir);
    const logPath = path.join(dir, 'demo-deploy-2019.log');
    writeFileSync(
      logPath,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\r\n`,
      { mode: 0o644 }
    );
    markFinished(logPath);

    const result = runRedact(dir, ['--output', 'deploy']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('REDACT_FILES_SCANNED=1');
    expect(result.stdout).toContain('REDACT_VALUES_MASKED=1');
    expect(readFileSync(logPath, 'utf8')).toBe(
      'PREVIEW_ACCESS_CODE=[REDACTED]\r\n'
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
    const linkPath = path.join(dir, 'linked-deploy.log');
    symlinkSync(outsideLog, linkPath);

    runRedact(dir);
    expect(readFileSync(inFlight, 'utf8')).toContain(FIXTURE.accessCode);
    expect(readFileSync(outsideLog, 'utf8')).toContain(FIXTURE.accessCode);
    countSensitiveLines(logPath);
  });

  test('honors exclude and recent-minute skips without touching active logs', () => {
    const { dir, logPath } = makeFixtureLogDir();
    const excluded = path.join(dir, 'demo-deploy-active.log');
    writeFileSync(
      excluded,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );
    markFinished(excluded);

    const excludedRun = runRedact(dir, ['--exclude', excluded]);
    expect(excludedRun.status).toBe(0);
    expect(readFileSync(excluded, 'utf8')).toContain(FIXTURE.accessCode);
    countSensitiveLines(logPath);

    writeFileSync(
      path.join(dir, 'fresh-deploy.log'),
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );
    markFinished(path.join(dir, 'fresh-deploy.log'));
    utimesSync(path.join(dir, 'fresh-deploy.log'), new Date(), new Date());

    const recentRun = runRedact(dir, ['--recent-minutes', '10']);
    expect(recentRun.status).toBe(0);
    expect(
      readFileSync(path.join(dir, 'fresh-deploy.log'), 'utf8')
    ).toContain(FIXTURE.accessCode);
  });

  test('mask_deploy_log leaves REDACT metrics lines intact', () => {
    const detached = readFileSync(detachedScript, 'utf8');
    const mask = detached.slice(
      detached.indexOf('mask_deploy_log() {'),
      detached.indexOf('\nemit_failure_log_tail()')
    );
    const input = [
      'REDACT_FILES_SCANNED=3',
      'REDACT_FILES_CHANGED=2',
      'REDACT_VALUES_MASKED=9',
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}`,
    ].join('\n');
    const result = spawnSync('bash', ['-c', `${mask}\nmask_deploy_log`], {
      input,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('REDACT_FILES_SCANNED=3');
    expect(result.stdout).toContain('REDACT_VALUES_MASKED=9');
    expect(result.stdout).toContain('PREVIEW_ACCESS_CODE=[REDACTED]');
    expect(result.stdout.includes(FIXTURE.accessCode)).toBe(false);
  });
});

function countFileLines(filePath) {
  const result = spawnSync('wc', ['-l', filePath], { encoding: 'utf8' });
  return Number(result.stdout.trim().split(/\s+/)[0]);
}
