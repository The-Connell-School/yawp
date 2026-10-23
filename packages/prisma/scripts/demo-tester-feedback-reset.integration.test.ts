import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = join(import.meta.dir, '..', '..', '..');
const PRISMA_DIR = join(import.meta.dir, '..');
const ADMIN_DB =
  process.env.DATABASE_ADMIN_URL ||
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres';
const DEMO_DB_NAME = 'yawp_demo';
const DEMO_DB = `postgresql://postgres:postgres@127.0.0.1:5432/${DEMO_DB_NAME}`;
const PATH_WITH_ROOT_BIN = `${join(ROOT, 'node_modules', '.bin')}:${process.env.PATH || ''}`;

function run(
  cmd: string,
  args: string[],
  env: Record<string, string> = {},
  cwd: string = ROOT
) {
  return spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

function adminPsql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', ADMIN_DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`admin psql failed: ${res.stderr || res.stdout}`);
  }
}

function demoPsql(sql: string) {
  const res = run('psql', ['-v', 'ON_ERROR_STOP=1', DEMO_DB, '-c', sql]);
  if (res.status !== 0) {
    throw new Error(`demo psql failed: ${res.stderr || res.stdout}`);
  }
}

function demoJson<T>(sql: string): T {
  const res = run('psql', ['-t', '-A', DEMO_DB, '-c', `SELECT to_jsonb((${sql}))::text;`]);
  if (res.status !== 0) {
    throw new Error(`demo json psql failed: ${res.stderr || res.stdout}`);
  }
  const line = res.stdout.trim().split('\n').pop() || 'null';
  return JSON.parse(line) as T;
}

function prismaMigrateDeploy() {
  const res = run(
    'bun',
    ['run', 'prisma', 'migrate', 'deploy'],
    {
      DATABASE_URL: DEMO_DB,
      PATH: PATH_WITH_ROOT_BIN,
    },
    PRISMA_DIR
  );
  if (res.status !== 0) {
    throw new Error(`migrate deploy failed: ${res.stderr || res.stdout}`);
  }
}

function runPreserve(command: 'export' | 'restore', env: Record<string, string>) {
  const previewRoot = env.PREVIEW_ROOT;
  const res = run(
    'node',
    [join(ROOT, 'scripts/preview/preserve-demo-tester-feedback.mjs'), command],
    {
      PREVIEW_TESTER_FEEDBACK_PSQL_DIRECT: '1',
      DATABASE_URL: DEMO_DB,
      DATABASE_NAME: DEMO_DB_NAME,
      PREVIEW_ROOT: previewRoot,
      ...env,
    }
  );
  return res;
}

function seedPostResetUsers() {
  demoPsql(`
    INSERT INTO "User" ("id","createdAt","updatedAt","email","name","isAdmin","isSuperAdmin")
    VALUES
      ('admin-after-reset', now(), now(), 'dev.admin@yawp.local', 'Dev Admin', true, true),
      ('student-after-reset', now(), now(), 'dev.student@yawp.local', 'Dev Student', false, false)
    ON CONFLICT DO NOTHING;
  `);
}

describe('demo tester feedback reset integration (real Postgres)', () => {
  test('export, drop, migrate, seed, restore preserves screenshots and remaps missing reporters', () => {
    adminPsql(`DROP DATABASE IF EXISTS ${DEMO_DB_NAME} WITH (FORCE);`);
    adminPsql(`CREATE DATABASE ${DEMO_DB_NAME};`);
    prismaMigrateDeploy();

    const largeScreenshot = `data:image/png;base64,${'A'.repeat(600 * 1024)}`;
    const seedFile = join(tmpdir(), `yawp-tf-seed-${Date.now()}.sql`);
    writeFileSync(
      seedFile,
      `
INSERT INTO "User" ("id","createdAt","updatedAt","email","name","isAdmin","isSuperAdmin")
VALUES
  ('admin-before-reset', now(), now(), 'dev.admin@yawp.local', 'Dev Admin', true, true),
  ('student-before-reset', now(), now(), 'dev.student@yawp.local', 'Dev Student', false, false),
  ('gone-intern', now(), now(), 'gone.intern@yawp.local', 'Gone Intern', false, false);
INSERT INTO "TesterFeedback" (
  "id","userId","url","userAgent","whatIDid","whatHappened","whatIWish",
  "severity","actions","screenshot","environment","createdAt"
) VALUES
  (
    'tf_large_1','student-before-reset','https://demo.example/one','ua','did','saw','wish',
    'high','[{"type":"click"}]'::jsonb,$$${largeScreenshot}$$,'demo','2026-10-23T18:00:00Z'
  ),
  (
    'tf_large_2','gone-intern','https://demo.example/two','ua','did','saw','wish',
    'medium',NULL,$$${largeScreenshot}$$,'demo','2026-10-23T18:01:00Z'
  );
`,
      'utf8'
    );
    const seedRes = run('psql', ['-v', 'ON_ERROR_STOP=1', DEMO_DB, '-f', seedFile]);
    rmSync(seedFile, { force: true });
    if (seedRes.status !== 0) {
      throw new Error(`seed failed: ${seedRes.stderr || seedRes.stdout}`);
    }

    const previewRoot = mkdtempSync(join(tmpdir(), 'yawp-demo-tf-int-'));
    try {
      const exported = runPreserve('export', { PREVIEW_ROOT: previewRoot });
      expect(exported.status).toBe(0);
      const backupFile = exported.stdout.trim();
      expect(backupFile).toContain('.tester-feedback-restore-');

      adminPsql(`DROP DATABASE IF EXISTS ${DEMO_DB_NAME} WITH (FORCE);`);
      adminPsql(`CREATE DATABASE ${DEMO_DB_NAME};`);
      prismaMigrateDeploy();
      seedPostResetUsers();

      const restored = runPreserve('restore', {
        PREVIEW_ROOT: previewRoot,
        BACKUP_FILE: backupFile,
      });
      expect(restored.status).toBe(0);
      expect(restored.stdout).toContain('TESTER_FEEDBACK_RESTORED=2');

      const rows = demoJson<
        Array<{
          id: string;
          userId: string;
          url: string;
          userAgent: string;
          whatIDid: string;
          whatHappened: string;
          whatIWish: string;
          severity: string | null;
          actions: unknown;
          screenshot: string | null;
          environment: string;
          createdAt: string;
        }>
      >(
        `SELECT jsonb_agg(to_jsonb(tf) ORDER BY tf.id) FROM "TesterFeedback" tf`
      );

      expect(rows).toHaveLength(2);
      const studentRow = rows.find((row) => row.id === 'tf_large_1');
      const internRow = rows.find((row) => row.id === 'tf_large_2');
      expect(studentRow?.userId).toBe('student-after-reset');
      expect(studentRow?.screenshot?.length).toBe(largeScreenshot.length);
      expect(internRow?.userId).toBe('admin-after-reset');
      expect(internRow?.screenshot?.length).toBe(largeScreenshot.length);
    } finally {
      rmSync(previewRoot, { recursive: true, force: true });
      adminPsql(`DROP DATABASE IF EXISTS ${DEMO_DB_NAME} WITH (FORCE);`);
    }
  });
});
