#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

const prismaRoot = join(import.meta.dir, '..');
const RECOVERABLE_FAILED_MIGRATIONS = [
  '20260703195500_realign_teacher_training_assignments',
];

const ENV = process.argv[2];

if (!ENV || ENV !== 'production') {
  console.error('Error: Environment must be explicitly set to "production"');
  console.error('Usage: bun run migrate-remote production');
  process.exit(1);
}

const DB_NAME = process.env.PROD_DB_NAME;
const DB_USER = process.env.PROD_DB_USER;
const DB_PASSWORD = process.env.PROD_DB_PASSWORD;
const SSH_HOST = `ec2-user@${process.env.PROD_SSH_HOST}`;
const DB_HOST = process.env.PROD_DB_HOST;
const SSH_KEY_PATH = process.env.PROD_SSH_KEY_PATH;
const SSH_KNOWN_HOSTS_PATH = process.env.PROD_SSH_KNOWN_HOSTS_PATH;
const LOCAL_PORT = process.env.PROD_DB_LOCAL_PORT ?? '3306';

const missing = [
  ['PROD_DB_HOST', DB_HOST],
  ['PROD_DB_NAME', DB_NAME],
  ['PROD_DB_PASSWORD', DB_PASSWORD],
  ['PROD_DB_USER', DB_USER],
  ['PROD_SSH_HOST', process.env.PROD_SSH_HOST],
  ['PROD_SSH_KEY_PATH', SSH_KEY_PATH],
  ['PROD_SSH_KNOWN_HOSTS_PATH', SSH_KNOWN_HOSTS_PATH],
].filter(([, value]) => !value);

if (missing.length > 0) {
  console.error(`Error: Missing required environment variables: ${missing.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

if (!existsSync(SSH_KEY_PATH!)) {
  console.error(`Error: SSH key not found at ${SSH_KEY_PATH}`);
  process.exit(1);
}

if (!existsSync(SSH_KNOWN_HOSTS_PATH!)) {
  console.error(
    `Error: SSH known-hosts file not found at ${SSH_KNOWN_HOSTS_PATH}`
  );
  process.exit(1);
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
      cwd: prismaRoot,
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', reject);
  });
}

async function listRecoverableFailedMigrations(env: NodeJS.ProcessEnv) {
  if (!env.DATABASE_URL) {
    return [];
  }

  const client = new pg.Client({
    connectionString: env.DATABASE_URL,
    ssl: env.REMOTE_MIGRATE_TUNNEL === '1'
      ? { rejectUnauthorized: false }
      : undefined,
  });
  try {
    await client.connect();
    const result = await client.query<{ migration_name: string }>(
      `
        SELECT migration_name
        FROM "_prisma_migrations"
        WHERE migration_name = ANY($1::text[])
          AND finished_at IS NULL
          AND rolled_back_at IS NULL
        ORDER BY started_at
      `,
      [RECOVERABLE_FAILED_MIGRATIONS]
    );

    return result.rows.map((row) => row.migration_name);
  } catch (error) {
    if ((error as { code?: string }).code === '42P01') {
      return [];
    }

    throw error;
  } finally {
    await client.end();
  }
}

async function resolveRecoverableFailedMigrations(env: NodeJS.ProcessEnv) {
  const failedMigrations = await listRecoverableFailedMigrations(env);

  for (const migrationName of failedMigrations) {
    console.log(`Marking failed migration ${migrationName} as rolled back before retrying deploy.`);
    const resolveCode = await runCommand(
      'bun',
      ['prisma', 'migrate', 'resolve', '--rolled-back', migrationName],
      env
    );

    if (resolveCode !== 0) {
      return resolveCode;
    }
  }

  return 0;
}

async function runProductionMigrations(env: NodeJS.ProcessEnv) {
  const generateCode = await runCommand('bun', ['prisma', 'generate'], env);
  if (generateCode !== 0) {
    return generateCode;
  }

  const resolveCode = await resolveRecoverableFailedMigrations(env);
  if (resolveCode !== 0) {
    return resolveCode;
  }

  const migrateCode = await runCommand('bun', ['prisma', 'migrate', 'deploy'], env);
  if (migrateCode !== 0) {
    return migrateCode;
  }

  const backfillCode = await runCommand(
    'bun',
    ['run', 'scripts/backfill-class-art-key.ts'],
    env
  );
  if (backfillCode !== 0) {
    return backfillCode;
  }

  return runCommand(
    'bun',
    ['run', 'scripts/assignment-type-release-gate.ts', '--require-data'],
    env
  );
}

const sshProcess = spawn('ssh', [
  '-N',
  '-o',
  'ExitOnForwardFailure=yes',
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  `UserKnownHostsFile=${SSH_KNOWN_HOSTS_PATH}`,
  '-L',
  `${LOCAL_PORT}:${DB_HOST}:5432`,
  SSH_HOST,
  '-i',
  SSH_KEY_PATH,
]);

let migrationStarted = false;

sshProcess.stderr.on('data', (data) => {
  console.error(`SSH Error: ${data}`);
});

sshProcess.on('error', (error) => {
  console.error('SSH process failed:', error);
  process.exit(1);
});

sshProcess.on('close', (code) => {
  if (!migrationStarted) {
    console.error(`SSH tunnel exited before migrations started with code ${code ?? 'unknown'}`);
    process.exit(code || 1);
  }
});

process.on('SIGINT', () => {
  sshProcess.kill();
  process.exit();
});

setTimeout(async () => {
  try {
    migrationStarted = true;
    const env = {
      ...process.env,
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${LOCAL_PORT}/${DB_NAME}`,
      REMOTE_MIGRATE_TUNNEL: '1',
    };

    const exitCode = await runProductionMigrations(env);
    sshProcess.kill();
    process.exit(exitCode);
  } catch (error) {
    console.error('Migration failed:', error);
    sshProcess.kill();
    process.exit(1);
  }
}, 4000);
