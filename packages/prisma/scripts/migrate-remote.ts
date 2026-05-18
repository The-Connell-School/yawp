#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';

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
const LOCAL_PORT = process.env.PROD_DB_LOCAL_PORT ?? '3306';

const missing = [
  ['PROD_DB_HOST', DB_HOST],
  ['PROD_DB_NAME', DB_NAME],
  ['PROD_DB_PASSWORD', DB_PASSWORD],
  ['PROD_DB_USER', DB_USER],
  ['PROD_SSH_HOST', process.env.PROD_SSH_HOST],
  ['PROD_SSH_KEY_PATH', SSH_KEY_PATH],
].filter(([, value]) => !value);

if (missing.length > 0) {
  console.error(`Error: Missing required environment variables: ${missing.map(([name]) => name).join(', ')}`);
  process.exit(1);
}

if (!existsSync(SSH_KEY_PATH!)) {
  console.error(`Error: SSH key not found at ${SSH_KEY_PATH}`);
  process.exit(1);
}

const sshProcess = spawn('ssh', [
  '-N',
  '-o',
  'ExitOnForwardFailure=yes',
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

// Wait for SSH tunnel to establish
setTimeout(async () => {
  try {
    migrationStarted = true;
    process.env.DATABASE_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${LOCAL_PORT}/${DB_NAME}`;

    const prismaProcess = spawn('bun', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env,
    });

    prismaProcess.on('close', (code) => {
      sshProcess.kill();
      process.exit(code || 0);
    });
  } catch (error) {
    console.error('Migration failed:', error);
    sshProcess.kill();
    process.exit(1);
  }
}, 4000);
