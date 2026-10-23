import { afterEach, describe, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const script = path.join(import.meta.dir, 'redact-deploy-logs.sh');
const roots = [];

const FIXTURE = {
  accessCode: 'fake-brave-otter-9001',
  seatCode1: 'fake-calm-panda-9002',
  seatCode2: 'fake-bold-fox-9003',
  masterCode: 'fake-master-access-code-9004',
  accessSecret: 'fake-access-secret-thirty-two-bytes-9005',
  jsonSnippet: '{"code":"fake-json-seat-code-9006","label":"Seat"}',
};

function sensitivePatterns() {
  return [
    FIXTURE.accessCode,
    FIXTURE.seatCode1,
    FIXTURE.seatCode2,
    FIXTURE.masterCode,
    FIXTURE.accessSecret,
    'fake-json-seat-code-9006',
  ];
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
      `PREVIEW_SEAT_CODE_2=${FIXTURE.seatCode2}`,
      `Preview seat 2 (Bryant Brock): ${FIXTURE.seatCode2}`,
      `PREVIEW_ACCESS_SEATS=${JSON.stringify([
        { code: FIXTURE.seatCode1, label: 'Seat 1' },
      ])}`,
      `YAWP_TEST_PREVIEW_ACCESS_SEATS=${JSON.stringify([
        { code: FIXTURE.seatCode2, label: 'Seat 2' },
      ])}`,
      `PREVIEW_MASTER_ACCESS_CODE=${FIXTURE.masterCode}`,
      `PREVIEW_ACCESS_SECRET=${FIXTURE.accessSecret}`,
      FIXTURE.jsonSnippet,
      'unchanged line without secrets',
      '',
    ].join('\n'),
    { mode: 0o640 }
  );
  utimesSync(logPath, oldMtime, oldMtime);

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
    const beforeLines = readFileSync(logPath, 'utf8').split('\n').length;
    const beforeStat = statSync(logPath);

    const first = runRedact(dir);
    expect(first.status).toBe(0);
    expect(first.stdout).toContain('files_scanned=1');
    expect(first.stdout).toContain('files_changed=1');
    expect(first.stdout).toMatch(/values_masked=[1-9]/);

    for (const needle of sensitivePatterns()) {
      expect(first.stdout.includes(needle)).toBe(false);
      expect(first.stderr.includes(needle)).toBe(false);
    }

    const afterText = readFileSync(logPath, 'utf8');
    expect(afterText.split('\n').length).toBe(beforeLines);
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

  test('honors exclude and recent-minute skips without touching active logs', () => {
    const { dir, logPath } = makeFixtureLogDir();
    const excluded = path.join(dir, 'demo-deploy-active.log');
    writeFileSync(
      excluded,
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );

    const excludedRun = runRedact(dir, ['--exclude', excluded]);
    expect(excludedRun.status).toBe(0);
    expect(readFileSync(excluded, 'utf8')).toContain(FIXTURE.accessCode);
    countSensitiveLines(logPath);

    writeFileSync(
      path.join(dir, 'fresh-deploy.log'),
      `PREVIEW_ACCESS_CODE=${FIXTURE.accessCode}\n`,
      { mode: 0o644 }
    );
    const recentRun = runRedact(dir, ['--recent-minutes', '10']);
    expect(recentRun.status).toBe(0);
    expect(readFileSync(path.join(dir, 'fresh-deploy.log'), 'utf8')).toContain(
      FIXTURE.accessCode
    );
  });
});
