#!/usr/bin/env node
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  TESTER_FEEDBACK_EXPORT_SQL,
  buildTesterFeedbackRestoreSql,
  redactEmailForLogs,
} from './preserve-demo-tester-feedback-lib.mjs';

function usage() {
  process.stderr.write(
    'Usage: preserve-demo-tester-feedback.mjs export|restore\n'
  );
  process.exit(2);
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function runDockerPostgres(args, { input } = {}) {
  const container = requireEnv('PREVIEW_POSTGRES_CONTAINER');
  const result = spawnSync('docker', ['exec', '-i', container, ...args], {
    encoding: 'utf8',
    input,
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(stderr || `docker exec failed with status ${result.status}`);
  }
  return result.stdout ?? '';
}

function tableExists(databaseName) {
  const output = runDockerPostgres([
    'psql',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    databaseName,
    '-Atc',
    `SELECT to_regclass('public."TesterFeedback"') IS NOT NULL;`,
  ]).trim();
  return output === 't';
}

async function exportBackup() {
  const previewRoot = requireEnv('PREVIEW_ROOT');
  const databaseName = requireEnv('DATABASE_NAME');
  if (databaseName !== 'yawp_demo') {
    throw new Error('Tester feedback preservation is limited to yawp_demo');
  }
  if (!tableExists(databaseName)) {
    process.stdout.write('\n');
    return;
  }

  const payload = runDockerPostgres([
    'psql',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    databaseName,
    '-Atc',
    TESTER_FEEDBACK_EXPORT_SQL,
  ]).trim();
  JSON.parse(payload || '[]');

  const backupDir = path.join(previewRoot, 'backups');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const prefix = path.join(backupDir, '.tester-feedback-restore-');
  const tempDir = await mkdtemp(prefix);
  const backupFile = path.join(tempDir, 'rows.json');
  await writeFile(backupFile, `${payload}\n`, { mode: 0o600 });
  process.stdout.write(`${backupFile}\n`);
}

async function restoreBackup() {
  const databaseName = requireEnv('DATABASE_NAME');
  const backupFile = requireEnv('BACKUP_FILE');
  if (databaseName !== 'yawp_demo') {
    throw new Error('Tester feedback preservation is limited to yawp_demo');
  }
  if (!tableExists(databaseName)) {
    throw new Error('TesterFeedback table is missing after demo seed');
  }

  const raw = await readFile(backupFile, 'utf8');
  const rows = JSON.parse(raw || '[]');
  if (!Array.isArray(rows)) {
    throw new Error('Tester feedback backup must be a JSON array');
  }
  if (rows.length === 0) {
    process.stdout.write('TESTER_FEEDBACK_RESTORED=0\n');
    return;
  }

  for (const row of rows) {
    if (row?.reporterEmail) {
      redactEmailForLogs(row.reporterEmail);
    }
  }

  const sql = buildTesterFeedbackRestoreSql(rows);
  runDockerPostgres(
    [
      'psql',
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      databaseName,
      '-f',
      '-',
    ],
    { input: `${sql}\n` }
  );
  const countOutput = runDockerPostgres([
    'psql',
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    databaseName,
    '-Atc',
    'SELECT count(*) FROM "TesterFeedback";',
  ]).trim();
  process.stdout.write(`TESTER_FEEDBACK_RESTORED=${countOutput}\n`);
  if (Number(countOutput) < rows.length) {
    throw new Error(
      `Tester feedback restore verification failed: expected at least ${rows.length} rows, found ${countOutput}`
    );
  }
}

const command = process.argv[2];
try {
  if (command === 'export') {
    await exportBackup();
  } else if (command === 'restore') {
    await restoreBackup();
  } else {
    usage();
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
