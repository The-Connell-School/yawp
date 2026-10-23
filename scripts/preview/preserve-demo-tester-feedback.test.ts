import { afterEach, describe, expect, test } from 'bun:test';
import { chmod, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildTesterFeedbackRestoreCopyPrefix,
  buildTesterFeedbackRestoreSql,
  redactEmailForLogs,
  sanitizeCliFailure,
} from './preserve-demo-tester-feedback-lib.mjs';

const scriptPath = path.resolve('scripts/preview/preserve-demo-tester-feedback.sh');
const mjsPath = path.resolve('scripts/preview/preserve-demo-tester-feedback.mjs');
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe('preserve demo tester feedback helpers', () => {
  test('redacts reporter emails in logs', () => {
    expect(redactEmailForLogs('dev.admin@yawp.local')).toBe('d***@y***.local');
    expect(redactEmailForLogs('')).toBe('[redacted]');
  });

  test('sanitizeCliFailure omits DETAIL and row payloads', () => {
    const message = sanitizeCliFailure(
      'psql',
      'ERROR: bad input\nDETAIL: Failing row contains (secret, dev.admin@yawp.local).\n'
    );
    expect(message).toContain('ERROR: bad input');
    expect(message).not.toContain('DETAIL');
    expect(message).not.toContain('dev.admin');
  });

  test('sanitizeCliFailure extracts SQLSTATE and redacts quoted values on first line', () => {
    const message = sanitizeCliFailure(
      'psql',
      'ERROR: duplicate key value violates unique constraint "TesterFeedback_pkey"\nSQLSTATE: 23505\nDETAIL: Key (id)=(tf_1) already exists.\n'
    );
    expect(message).toContain('SQLSTATE 23505');
    expect(message).toContain('<redacted>');
    expect(message).not.toContain('TesterFeedback_pkey');
    expect(message).not.toContain('tf_1');
  });

  test('restore SQL remaps reporter email and keeps screenshot column', () => {
    const sql = buildTesterFeedbackRestoreSql([
      {
        id: 'tf_1',
        userId: 'old-user',
        reporterEmail: 'dev.student@yawp.local',
        url: 'https://demo.example/page',
        userAgent: 'agent',
        whatIDid: 'clicked',
        whatHappened: 'broken',
        whatIWish: 'fixed',
        severity: 'high',
        actions: [{ type: 'click' }],
        screenshot: 'data:image/png;base64,abc',
        environment: 'demo',
        createdAt: '2026-10-23T18:00:00.000Z',
      },
    ]);

    expect(sql).toContain('incoming.screenshot');
    expect(sql).toContain('dev.admin@yawp.local');
    expect(sql).toContain('reporterEmail');
    expect(sql).toContain('ON CONFLICT (id) DO UPDATE');
    expect(sql).toContain('decode(string_agg');
    expect(sql).toContain('COPY _demo_tester_feedback_restore_b64');
    expect(sql).not.toContain('$data$');
  });

  test('restore SQL base64-encodes user text so nothing raw appears in SQL', () => {
    const injection =
      "$data$\\n'; DROP TABLE \"TesterFeedback\"; COPY x FROM PROGRAM 'id'; COMMIT; --";
    const rows = [
      {
        id: 'tf_inj',
        userId: 'old',
        reporterEmail: 'dev.student@yawp.local',
        url: 'https://demo.example',
        userAgent: 'ua',
        whatIDid: injection,
        whatHappened: '$$',
        whatIWish: 'line1\nline2\t\u2603',
        severity: 'low',
        actions: [{ note: injection }],
        environment: 'demo',
        createdAt: '2026-10-23T18:00:00.000Z',
      },
    ];
    const sql = buildTesterFeedbackRestoreSql(rows, false);
    expect(sql).not.toContain('$data$');
    expect(sql).not.toContain('DROP TABLE');
    expect(sql).not.toContain(injection);
    const prefix = buildTesterFeedbackRestoreCopyPrefix();
    const base64Line = sql.slice(prefix.length + 1).split('\n')[0];
    expect(Buffer.from(base64Line, 'base64').toString('utf8')).toBe(JSON.stringify(rows));
  });
});

async function makeDockerHarness(options: {
  tableExists?: boolean;
  exportPayload?: string;
  restoreFails?: boolean;
  userCount?: string;
}) {
  const root = await mkdtemp(path.join(tmpdir(), 'yawp-tf-preserve-'));
  temporaryDirectories.push(root);
  const bin = path.join(root, 'bin');
  const commandLog = path.join(root, 'commands.log');
  await mkdir(bin);

  const payloadFile = path.join(root, 'export-payload.txt');
  await writeFile(payloadFile, options.exportPayload ?? '[]', 'utf8');
  const docker = path.join(bin, 'docker');
  await writeFile(
    docker,
    `#!/usr/bin/env bash
set -euo pipefail
printf 'docker' >> "$COMMAND_LOG"
printf ' %q' "$@" >> "$COMMAND_LOG"
printf '\n' >> "$COMMAND_LOG"
joined="$*"
if [[ "$joined" == *"to_regclass"* ]]; then
  printf '${options.tableExists === false ? 'f' : 't'}\n'
elif [[ "$joined" == *"information_schema"* ]] || [[ "$joined" == *"column_name"* ]]; then
  printf 't\n'
elif [[ "$joined" == *"count(*) FROM"* && "$joined" != *"json_agg"* ]]; then
  printf '${options.userCount ?? '1'}\n'
elif [[ "$joined" == *"json_agg"* ]] || [[ "$joined" == *"row_to_json"* ]]; then
  cat "${payloadFile}"
  printf '\n'
elif [[ "$joined" == *" -f "* ]]; then
  cat >/dev/null
  if [[ "${options.restoreFails ? 'true' : 'false'}" == "true" ]]; then
    exit 9
  fi
fi
`
  );
  await chmod(docker, 0o755);

  return {
    root,
    commandLog,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      COMMAND_LOG: commandLog,
      PREVIEW_ROOT: root,
      DATABASE_NAME: 'yawp_demo',
      PREVIEW_POSTGRES_CONTAINER: 'preview-postgres',
    },
  };
}

describe('preserve demo tester feedback reset path', () => {
  test('export writes a private backup under PREVIEW_ROOT/backups', async () => {
    const harness = await makeDockerHarness({
      exportPayload:
        '[{"id":"tf_1","reporterEmail":"dev.student@yawp.local","screenshot":"x"}]',
    });
    const result = Bun.spawnSync({
      cmd: ['bash', scriptPath, 'export'],
      cwd: path.resolve('.'),
      env: harness.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const backupFile = result.stdout.toString().trim();
    expect(backupFile).toContain('/backups/.tester-feedback-restore-');
    const payload = await Bun.file(backupFile).text();
    expect(JSON.parse(payload)[0].screenshot).toBe('x');
  });

  test('restore fails loudly when postgres restore fails', async () => {
    const harness = await makeDockerHarness({ restoreFails: true });
    const backupDir = path.join(harness.root, 'backups', '.tester-feedback-restore-test');
    await mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, 'rows.json');
    await writeFile(
      backupFile,
      JSON.stringify([
        {
          id: 'tf_1',
          reporterEmail: 'dev.student@yawp.local',
          url: 'https://demo.example',
          userAgent: 'ua',
          whatIDid: 'a',
          whatHappened: 'b',
          whatIWish: 'c',
          environment: 'demo',
          createdAt: '2026-10-23T18:00:00.000Z',
        },
      ]),
      { mode: 0o600 }
    );

    const result = Bun.spawnSync({
      cmd: ['bash', scriptPath, 'restore'],
      cwd: path.resolve('.'),
      env: {
        ...harness.env,
        BACKUP_FILE: backupFile,
        DEMO_TESTER_FEEDBACK_BACKUP_FILE: backupFile,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).not.toContain('dev.student@yawp.local');
  });

  test('restore succeeds and verifies restored row count', async () => {
    const harness = await makeDockerHarness({ userCount: '2' });
    const backupDir = path.join(harness.root, 'backups', '.tester-feedback-restore-test');
    await mkdir(backupDir, { recursive: true });
    const backupFile = path.join(backupDir, 'rows.json');
    await writeFile(
      backupFile,
      JSON.stringify([
        {
          id: 'tf_1',
          reporterEmail: 'dev.student@yawp.local',
          url: 'https://demo.example',
          userAgent: 'ua',
          whatIDid: 'a',
          whatHappened: 'b',
          whatIWish: 'c',
          environment: 'demo',
          createdAt: '2026-10-23T18:00:00.000Z',
        },
        {
          id: 'tf_2',
          reporterEmail: 'missing.person@example.com',
          url: 'https://demo.example/two',
          userAgent: 'ua',
          whatIDid: 'a',
          whatHappened: 'b',
          whatIWish: 'c',
          environment: 'demo',
          createdAt: '2026-10-23T18:01:00.000Z',
        },
      ]),
      { mode: 0o600 }
    );

    const result = Bun.spawnSync({
      cmd: ['bash', scriptPath, 'restore'],
      cwd: path.resolve('.'),
      env: {
        ...harness.env,
        BACKUP_FILE: backupFile,
        DEMO_TESTER_FEEDBACK_BACKUP_FILE: backupFile,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('TESTER_FEEDBACK_RESTORED=2');
    expect(await Bun.file(backupFile).exists()).toBe(false);
  });

  test('export refuses non-demo databases', () => {
    const result = Bun.spawnSync({
      cmd: ['bash', scriptPath, 'export'],
      cwd: path.resolve('.'),
      env: {
        ...process.env,
        PREVIEW_ROOT: '/tmp/yawp-demo',
        DATABASE_NAME: 'yawp_pr_42',
        PREVIEW_POSTGRES_CONTAINER: 'preview-postgres',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).not.toBe(0);
  });

  test('export streams multi-megabyte screenshots without stdout buffering limits', async () => {
    const large = 'B'.repeat(600 * 1024);
    const payload = JSON.stringify([
      {
        id: 'tf_big_1',
        reporterEmail: 'dev.student@yawp.local',
        screenshot: large,
        url: 'https://demo.example/one',
        userAgent: 'ua',
        whatIDid: 'a',
        whatHappened: 'b',
        whatIWish: 'c',
        environment: 'demo',
        createdAt: '2026-10-23T18:00:00.000Z',
      },
      {
        id: 'tf_big_2',
        reporterEmail: 'dev.student@yawp.local',
        screenshot: large,
        url: 'https://demo.example/two',
        userAgent: 'ua',
        whatIDid: 'a',
        whatHappened: 'b',
        whatIWish: 'c',
        environment: 'demo',
        createdAt: '2026-10-23T18:01:00.000Z',
      },
    ]);
    const harness = await makeDockerHarness({ exportPayload: payload });
    const result = Bun.spawnSync({
      cmd: ['bash', scriptPath, 'export'],
      cwd: path.resolve('.'),
      env: harness.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).toBe(0);
    const backupFile = result.stdout.toString().trim();
    const saved = await Bun.file(backupFile).text();
    const parsed = JSON.parse(saved);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].screenshot.length).toBe(600 * 1024);
  });

  test('mjs export validates json payload shape', async () => {
    const harness = await makeDockerHarness({ exportPayload: 'not-json' });
    const result = Bun.spawnSync({
      cmd: ['node', mjsPath, 'export'],
      cwd: path.resolve('.'),
      env: harness.env,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(result.exitCode).not.toBe(0);
  });
});
