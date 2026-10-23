#!/usr/bin/env node
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { finished } from 'node:stream/promises';
import {
  SCREENSHOT_COLUMN_PROBE_SQL,
  buildTesterFeedbackExportSql,
  buildTesterFeedbackRestoreStreamParts,
  sanitizeCliFailure,
  sanitizeJsonFailure,
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

function usesDirectPsql() {
  return process.env.PREVIEW_TESTER_FEEDBACK_PSQL_DIRECT === '1';
}

function buildPsqlSpawnArgs(databaseName, psqlArgs) {
  if (usesDirectPsql()) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required when PREVIEW_TESTER_FEEDBACK_PSQL_DIRECT=1');
    }
    return {
      command: 'psql',
      args: [databaseUrl, ...psqlArgs],
    };
  }
  const container = requireEnv('PREVIEW_POSTGRES_CONTAINER');
  return {
    command: 'docker',
    args: ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', databaseName, ...psqlArgs],
  };
}

async function collectStreamText(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function runPsql(databaseName, psqlArgs, { stdin } = {}) {
  const { command, args } = buildPsqlSpawnArgs(databaseName, psqlArgs);
  const child = spawn(command, args, {
    stdio: [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'],
  });
  if (stdin) {
    child.stdin.write(stdin);
    child.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    collectStreamText(child.stdout),
    collectStreamText(child.stderr),
    new Promise((resolve) => child.on('close', resolve)),
  ]);
  if (exitCode !== 0) {
    throw new Error(sanitizeCliFailure('psql', stderr || stdout));
  }
  return stdout;
}

async function streamPsqlStdoutToFile(databaseName, psqlArgs, destinationPath) {
  const { command, args } = buildPsqlSpawnArgs(databaseName, psqlArgs);
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const destination = createWriteStream(destinationPath, { mode: 0o600 });
  child.stdout.pipe(destination);
  const stderrChunks = [];
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));
  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  await finished(destination);
  if (exitCode !== 0) {
    throw new Error(
      sanitizeCliFailure('psql export', Buffer.concat(stderrChunks).toString('utf8'))
    );
  }
}

async function streamRestoreSql(databaseName, prefix, backupFile, suffix) {
  const { command, args } = buildPsqlSpawnArgs(databaseName, [
    '--no-psqlrc',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    '-',
  ]);
  const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const stderrChunks = [];
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

  await new Promise((resolve, reject) => {
    child.stdin.write(prefix);
    const input = createReadStream(backupFile);
    input.on('error', reject);
    child.stdin.on('error', reject);
    input.on('data', (chunk) => {
      if (!child.stdin.write(chunk)) {
        input.pause();
        child.stdin.once('drain', () => input.resume());
      }
    });
    input.on('end', () => {
      child.stdin.write(suffix);
      child.stdin.end();
      resolve(undefined);
    });
  });

  const exitCode = await new Promise((resolve) => child.on('close', resolve));
  if (exitCode !== 0) {
    throw new Error(
      sanitizeCliFailure('psql restore', Buffer.concat(stderrChunks).toString('utf8'))
    );
  }
}

async function tableExists(databaseName) {
  const output = (
    await runPsql(databaseName, [
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      `SELECT to_regclass('public."TesterFeedback"') IS NOT NULL;`,
    ])
  ).trim();
  return output === 't';
}

async function screenshotColumnExists(databaseName) {
  const output = (
    await runPsql(databaseName, [
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      SCREENSHOT_COLUMN_PROBE_SQL,
    ])
  ).trim();
  return output === 't';
}

async function validateBackupJsonFile(backupFile) {
  try {
    const raw = await readFile(backupFile, 'utf8');
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) {
      throw new SyntaxError('not-array');
    }
    return parsed.length;
  } catch (error) {
    throw new Error(sanitizeJsonFailure(error));
  }
}

async function exportBackup() {
  const previewRoot = requireEnv('PREVIEW_ROOT');
  const databaseName = requireEnv('DATABASE_NAME');
  if (databaseName !== 'yawp_demo') {
    throw new Error('Tester feedback preservation is limited to yawp_demo');
  }
  if (!(await tableExists(databaseName))) {
    process.stdout.write('\n');
    return;
  }

  const includeScreenshot = await screenshotColumnExists(databaseName);
  if (!includeScreenshot) {
    process.stderr.write(
      'TesterFeedback.screenshot column missing; exporting without screenshot payloads\n'
    );
  }

  const backupDir = path.join(previewRoot, 'backups');
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const tempDir = await mkdtemp(path.join(backupDir, '.tester-feedback-restore-'));
  const backupFile = path.join(tempDir, 'rows.json');

  await streamPsqlStdoutToFile(
    databaseName,
    ['--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-Atc', buildTesterFeedbackExportSql(includeScreenshot)],
    backupFile
  );
  await validateBackupJsonFile(backupFile);
  process.stdout.write(`${backupFile}\n`);
}

async function restoreBackup() {
  const databaseName = requireEnv('DATABASE_NAME');
  const backupFile = requireEnv('BACKUP_FILE');
  if (databaseName !== 'yawp_demo') {
    throw new Error('Tester feedback preservation is limited to yawp_demo');
  }
  if (!(await tableExists(databaseName))) {
    throw new Error('TesterFeedback table is missing after demo seed');
  }

  const rowCount = await validateBackupJsonFile(backupFile);
  if (rowCount === 0) {
    process.stdout.write('TESTER_FEEDBACK_RESTORED=0\n');
    return;
  }

  const includeScreenshot = await screenshotColumnExists(databaseName);
  const { prefix, suffix } = buildTesterFeedbackRestoreStreamParts(includeScreenshot);
  await streamRestoreSql(databaseName, prefix, backupFile, suffix);

  const countOutput = (
    await runPsql(databaseName, [
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-Atc',
      'SELECT count(*) FROM "TesterFeedback";',
    ])
  ).trim();
  process.stdout.write(`TESTER_FEEDBACK_RESTORED=${countOutput}\n`);
  if (Number(countOutput) < rowCount) {
    throw new Error(
      `Tester feedback restore verification failed: expected at least ${rowCount} rows, found ${countOutput}`
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
