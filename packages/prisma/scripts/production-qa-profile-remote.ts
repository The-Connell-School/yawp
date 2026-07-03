#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { assertProductionQaPassword } from './production-qa-profile';

const prismaRoot = join(import.meta.dir, '..');
const ENV = process.argv[2];

if (ENV !== 'production') {
  console.error('Usage: bun run production-qa-profile-remote production');
  process.exit(1);
}

const DB_NAME = process.env.PROD_DB_NAME;
const DB_USER = process.env.PROD_DB_USER;
const DB_PASSWORD = process.env.PROD_DB_PASSWORD;
const SSH_HOST = `ec2-user@${process.env.PROD_SSH_HOST}`;
const DB_HOST = process.env.PROD_DB_HOST;
const SSH_KEY_PATH = process.env.PROD_SSH_KEY_PATH;
const LOCAL_PORT = process.env.PROD_DB_LOCAL_PORT ?? '3307';

const missing = [
  ['PROD_DB_HOST', DB_HOST],
  ['PROD_DB_NAME', DB_NAME],
  ['PROD_DB_PASSWORD', DB_PASSWORD],
  ['PROD_DB_USER', DB_USER],
  ['PROD_QA_PASSWORD', process.env.PROD_QA_PASSWORD],
  ['PROD_SSH_HOST', process.env.PROD_SSH_HOST],
  ['PROD_SSH_KEY_PATH', SSH_KEY_PATH],
].filter(([, value]) => !value);

if (missing.length > 0) {
  console.error(
    `Error: Missing required environment variables: ${missing
      .map(([name]) => name)
      .join(', ')}`
  );
  process.exit(1);
}

assertProductionQaPassword(process.env.PROD_QA_PASSWORD);

if (!existsSync(SSH_KEY_PATH!)) {
  console.error(`Error: SSH key not found at ${SSH_KEY_PATH}`);
  process.exit(1);
}

function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env,
      cwd: prismaRoot,
    });

    child.on('close', (code) => resolve(code ?? 1));
    child.on('error', reject);
  });
}

const sshProcess = spawn('ssh', [
  '-N',
  '-o',
  'ExitOnForwardFailure=yes',
  '-L',
  `${LOCAL_PORT}:${DB_HOST}:5432`,
  SSH_HOST,
  '-i',
  SSH_KEY_PATH!,
]);

let scriptStarted = false;

sshProcess.stderr.on('data', (data) => {
  console.error(`SSH Error: ${data}`);
});

sshProcess.on('error', (error) => {
  console.error('SSH process failed:', error);
  process.exit(1);
});

sshProcess.on('close', (code) => {
  if (!scriptStarted) {
    console.error(
      `SSH tunnel exited before QA provisioning started with code ${
        code ?? 'unknown'
      }`
    );
    process.exit(code || 1);
  }
});

process.on('SIGINT', () => {
  sshProcess.kill();
  process.exit();
});

setTimeout(async () => {
  try {
    scriptStarted = true;
    const env = {
      ...process.env,
      DATABASE_URL: `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${LOCAL_PORT}/${DB_NAME}`,
      REMOTE_MIGRATE_TUNNEL: '1',
    };

    const exitCode = await runCommand(
      'bun',
      ['run', 'scripts/production-qa-profile.ts'],
      env
    );
    sshProcess.kill();
    process.exit(exitCode);
  } catch (error) {
    console.error('Production QA provisioning failed:', error);
    sshProcess.kill();
    process.exit(1);
  }
}, 4000);
