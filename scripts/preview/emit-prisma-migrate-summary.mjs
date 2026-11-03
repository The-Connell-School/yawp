#!/usr/bin/env node
/**
 * Reads Prisma migrate deploy output and prints safe, grep-friendly summary lines
 * for demo GitHub Actions (no connection strings or secrets).
 */
import { readFileSync } from 'node:fs';

const logPath = process.argv[2];
if (!logPath) {
  process.stderr.write('Usage: emit-prisma-migrate-summary.mjs <migrate-log-file>\n');
  process.exit(2);
}

const raw = readFileSync(logPath, 'utf8');
const lines = raw.split(/\r?\n/);

const applied = [];
let sawNoPending = false;
let sawAllApplied = false;

for (const line of lines) {
  const applying = line.match(/Applying migration [`']([^`']+)[`']/);
  if (applying) {
    applied.push(applying[1]);
    continue;
  }
  if (/No pending migrations to apply\.?/i.test(line)) {
    sawNoPending = true;
  }
  if (/All migrations have been successfully applied\.?/i.test(line)) {
    sawAllApplied = true;
  }
}

if (applied.length > 0) {
  for (const name of applied) {
    if (!/^[0-9A-Za-z_]+$/.test(name)) {
      process.stderr.write('Refusing to emit unexpected migration name shape\n');
      process.exit(1);
    }
    process.stdout.write(`DEMO_PRISMA_MIGRATE_APPLIED=${name}\n`);
  }
  process.stdout.write(
    `DEMO_PRISMA_MIGRATE_SUMMARY=Applied ${applied.length} migration(s)\n`
  );
  process.exit(0);
}

if (sawNoPending) {
  process.stdout.write('DEMO_PRISMA_MIGRATE_SUMMARY=No pending migrations\n');
  process.exit(0);
}

if (sawAllApplied) {
  process.stdout.write(
    'DEMO_PRISMA_MIGRATE_SUMMARY=All migrations have been successfully applied\n'
  );
  process.exit(0);
}

process.stdout.write('DEMO_PRISMA_MIGRATE_SUMMARY=unknown (no migrate markers in log)\n');
process.exit(0);
