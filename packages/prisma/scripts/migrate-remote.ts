#!/usr/bin/env bun

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ENV = process.argv[2];

if (!ENV || ENV !== 'production') {
  console.error('Error: Environment must be explicitly set to "production"');
  console.error('Usage: bun run migrate-remote production');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is not set');
  process.exit(1);
}

const DB_NAME = process.env.PROD_DB_NAME;
const DB_USER = process.env.PROD_DB_USER;
const DB_PASSWORD = process.env.PROD_DB_PASSWORD;
const SSH_HOST = 'ubuntu@3.95.155.157';
const DB_HOST = process.env.PROD_DB_HOST;

const SSH_KEY_PATH = join(homedir(), '.ssh', 'yawp-production-bastion');

if (!existsSync(SSH_KEY_PATH)) {
  console.error(`SSH key not found at ${SSH_KEY_PATH}`);
  process.exit(1);
}

const sshProcess = spawn('ssh', [
  '-N',
  '-L',
  `3306:${DB_HOST}:5432`,
  SSH_HOST,
  '-i',
  SSH_KEY_PATH,
]);

sshProcess.stderr.on('data', (data) => {
  console.error(`SSH Error: ${data}`);
});

process.on('SIGINT', () => {
  sshProcess.kill();
  process.exit();
});

// Wait for SSH tunnel to establish
setTimeout(async () => {
  try {
    process.env.DATABASE_URL = `postgresql://${DB_USER}:${DB_PASSWORD}@localhost:3306/${DB_NAME}`;

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
