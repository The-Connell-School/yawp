import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const scriptPath = path.resolve('scripts/preview/emit-prisma-migrate-summary.mjs');

describe('emit prisma migrate summary', () => {
  test('reports applied migration names without connection strings', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'migrate-log-'));
    const logPath = path.join(dir, 'migrate.log');
    await writeFile(
      logPath,
      [
        'Datasource "db": PostgreSQL database "yawp_demo", schema "public" at "postgres:5432"',
        'Applying migration `20261023180000_tester_feedback_screenshot`',
        'All migrations have been successfully applied.',
      ].join('\n'),
      'utf8'
    );
    const result = Bun.spawnSync({
      cmd: ['node', scriptPath, logPath],
      cwd: path.resolve('.'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await rm(dir, { recursive: true, force: true });
    expect(result.exitCode).toBe(0);
    const out = result.stdout.toString();
    expect(out).toContain(
      'DEMO_PRISMA_MIGRATE_APPLIED=20261023180000_tester_feedback_screenshot'
    );
    expect(out).toContain('DEMO_PRISMA_MIGRATE_SUMMARY=Applied 1 migration(s)');
    expect(out).not.toContain('postgres:5432');
  });

  test('reports no pending migrations', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'migrate-log-'));
    const logPath = path.join(dir, 'migrate.log');
    await writeFile(logPath, 'No pending migrations to apply.\n', 'utf8');
    const result = Bun.spawnSync({
      cmd: ['node', scriptPath, logPath],
      cwd: path.resolve('.'),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await rm(dir, { recursive: true, force: true });
    expect(result.stdout.toString()).toContain(
      'DEMO_PRISMA_MIGRATE_SUMMARY=No pending migrations'
    );
  });
});
